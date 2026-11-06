import "@/lib/server-guard";
import { sql } from "drizzle-orm";
import type { Clock } from "@/lib/clock";
import { getDb, type Db, type DbOrTx, type Tx } from "./client";

/** Current time as seen by the database (inside the open transaction). */
export async function dbNow(db: DbOrTx): Promise<Date> {
  const result = await db.execute<{ now: Date }>(sql`select now() as now`);
  return new Date(result.rows[0].now);
}

/** Resolves "now" for a transition: an injected clock (tests, jobs) or database time (default). */
export async function resolveNow(db: DbOrTx, clock?: Clock): Promise<Date> {
  return clock ? clock.now() : dbNow(db);
}

/** Runs `fn` in a transaction with the resolved transition time. */
export async function withClockTx<T>(fn: (tx: Tx, now: Date) => Promise<T>, opts: { clock?: Clock; db?: Db } = {}): Promise<T> {
  const db = opts.db ?? getDb();
  return db.transaction(async (tx) => {
    const now = await resolveNow(tx, opts.clock);
    return fn(tx, now);
  });
}

/** Postgres serialization/deadlock errors that are safe to retry. */
export function isRetryableTxError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "40001" || code === "40P01";
}

export async function retryTx<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      if (!isRetryableTxError(error)) throw error;
    }
  }
  throw lastError;
}
