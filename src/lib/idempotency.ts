import "@/lib/server-guard";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { idempotencyKeys } from "@/lib/db/core-schema";
import { errors } from "@/lib/errors";
import { sha256Hex, stableStringify } from "@/lib/ids";

/**
 * Scopes an idempotency key by actor and operation. The same key with a different request body is a conflict.
 * The first completed response is replayed for later calls with the same key and body.
 */
export async function withIdempotency<T>(
  opts: { actorId: string; operation: string; key: string | undefined; request: unknown },
  run: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T; replayed: boolean }> {
  if (!opts.key) {
    const result = await run();
    return { ...result, replayed: false };
  }
  const db = getDb();
  const requestHash = sha256Hex(stableStringify(opts.request));
  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.actorId, opts.actorId), eq(idempotencyKeys.operation, opts.operation), eq(idempotencyKeys.key, opts.key)))
    .limit(1);
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw errors.conflict("IDEMPOTENCY_CONFLICT", "This operation key was already used with a different request.");
    }
    if (existing.responseStatus !== null && existing.responseBody !== null) {
      return { status: existing.responseStatus, body: existing.responseBody as T, replayed: true };
    }
  } else {
    await db.insert(idempotencyKeys).values({ actorId: opts.actorId, operation: opts.operation, key: opts.key, requestHash }).onConflictDoNothing();
  }
  const result = await run();
  await db
    .update(idempotencyKeys)
    .set({ responseStatus: result.status, responseBody: result.body })
    .where(and(eq(idempotencyKeys.actorId, opts.actorId), eq(idempotencyKeys.operation, opts.operation), eq(idempotencyKeys.key, opts.key)));
  return { ...result, replayed: false };
}
