import "@/lib/server-guard";
import { and, eq, lt, or } from "drizzle-orm";
import type { Clock } from "@/lib/clock";
import { getDb, type Db } from "@/lib/db/client";
import { jobLeases } from "@/lib/db/core-schema";
import { newId } from "@/lib/ids";
import { log } from "@/lib/logger";
import type { PaymentProvider } from "@/lib/razorpay/provider";
import { tryGetPaymentProvider } from "@/lib/razorpay/client";
import { expireDueBookings } from "@/features/bookings/service";
import { escalateOverdueReviews } from "@/features/verification/service";
import { processInboxBatch } from "@/features/payments/webhooks";
import { processOutboxBatch } from "@/features/payments/outbox-worker";
import { reconcilePendingOrders, reconcileProcessingRefunds } from "@/features/payments/reconcile";

export type TickDeps = { clock?: Clock; db?: Db; provider?: PaymentProvider | null };

export type TickResult = {
  leased: boolean;
  reconciledOrders?: { checked: number; captured: number };
  expired?: { holdsExpired: number; balancesExpired: number };
  escalated?: number;
  inbox?: { processed: number; retried: number; failed: number };
  outbox?: { delivered: number; retried: number; failed: number };
  refundsReconciled?: { checked: number };
  providerConfigured: boolean;
  durationMs: number;
};

const LEASE_SECONDS = 55;

/**
 * One scheduler tick. Acquires a short database lease so overlapping invocations never run concurrently,
 * then processes bounded batches in a fixed order: reconcile payable orders near expiry, expire deadlines,
 * escalate overdue reviews, drain the webhook inbox, deliver the outbox, reconcile stuck refunds.
 */
export async function runTick(deps: TickDeps = {}): Promise<TickResult> {
  const started = Date.now();
  const db = deps.db ?? getDb();
  const now = deps.clock ? deps.clock.now() : new Date();
  const provider = deps.provider === undefined ? tryGetPaymentProvider() : deps.provider;
  const leaseId = newId();
  const leasedUntil = new Date(now.getTime() + LEASE_SECONDS * 1000);
  const acquired = await db
    .insert(jobLeases)
    .values({ name: "tick", leaseId, leasedUntil })
    .onConflictDoUpdate({
      target: jobLeases.name,
      set: { leaseId, leasedUntil },
      setWhere: or(lt(jobLeases.leasedUntil, now), eq(jobLeases.leaseId, leaseId)),
    })
    .returning({ leaseId: jobLeases.leaseId });
  if (!acquired[0] || acquired[0].leaseId !== leaseId) {
    return { leased: false, providerConfigured: Boolean(provider), durationMs: Date.now() - started };
  }

  const result: TickResult = { leased: true, providerConfigured: Boolean(provider), durationMs: 0 };
  const providerDeps = provider ? { clock: deps.clock, db, provider } : null;
  try {
    if (providerDeps) result.reconciledOrders = await safe("reconcilePendingOrders", () => reconcilePendingOrders(providerDeps));
    result.expired = await safe("expireDueBookings", () => expireDueBookings({ clock: deps.clock, db }));
    result.escalated = await safe("escalateOverdueReviews", () => escalateOverdueReviews({ clock: deps.clock, db }));
    result.inbox = await safe("processInboxBatch", () => processInboxBatch(50, { clock: deps.clock, db, provider: provider ?? undefined }));
    result.outbox = await safe("processOutboxBatch", () => processOutboxBatch(50, { clock: deps.clock, db, provider: provider ?? undefined }));
    if (providerDeps) result.refundsReconciled = await safe("reconcileProcessingRefunds", () => reconcileProcessingRefunds(providerDeps));
  } finally {
    result.durationMs = Date.now() - started;
    await db
      .update(jobLeases)
      .set({ leasedUntil: now, lastRunAt: now, lastResult: result as unknown as Record<string, unknown> })
      .where(and(eq(jobLeases.name, "tick"), eq(jobLeases.leaseId, leaseId)));
  }
  return result;
}

async function safe<T>(step: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error: unknown) {
    log.error("tick.step_failed", { step, error });
    return undefined;
  }
}

/** Monitoring: when the last successful tick is older than this, the scheduler has stopped. */
export async function schedulerHealth(db: Db = getDb()): Promise<{ lastRunAt: Date | null; stale: boolean }> {
  const [row] = await db.select({ lastRunAt: jobLeases.lastRunAt }).from(jobLeases).where(eq(jobLeases.name, "tick")).limit(1);
  const lastRunAt = row?.lastRunAt ?? null;
  const stale = !lastRunAt || Date.now() - lastRunAt.getTime() > 5 * 60_000;
  return { lastRunAt, stale };
}

