import "@/lib/server-guard";
import type { DbOrTx } from "@/lib/db/client";
import { outbox, type OutboxKind } from "./schema";

/**
 * Durable side effects (emails, alerts, refund submissions) are written in the same transaction as the
 * state change that caused them. `transitionKey` makes each business transition deliver at most once.
 */
export async function enqueue(db: DbOrTx, kind: OutboxKind, transitionKey: string, payload: Record<string, unknown>) {
  await db.insert(outbox).values({ kind, transitionKey, payload }).onConflictDoNothing();
}

export function backoffMinutes(attempt: number): number {
  return Math.min(60, 2 ** Math.min(attempt, 6));
}
