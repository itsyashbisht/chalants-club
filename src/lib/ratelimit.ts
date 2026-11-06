import "@/lib/server-guard";
import { sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/lib/db/client";
import { errors } from "@/lib/errors";

/**
 * Fixed-window rate limiter backed by Postgres so limits are shared across instances.
 * Returns the current count; throws RATE_LIMITED when the window exceeds `max`.
 */
export async function rateLimit(
  opts: { key: string; max: number; windowSeconds: number; now?: Date },
  db: DbOrTx = getDb(),
): Promise<number> {
  const now = opts.now ?? new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (opts.windowSeconds * 1000)) * opts.windowSeconds * 1000);
  const result = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count)
    values (${opts.key}, ${windowStart}, 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start = excluded.window_start then rate_limits.count + 1 else 1 end,
      window_start = excluded.window_start
    returning count
  `);
  const count = Number(result.rows[0]?.count ?? 1);
  if (count > opts.max) throw errors.rateLimited();
  return count;
}
