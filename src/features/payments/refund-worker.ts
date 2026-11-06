import "@/lib/server-guard";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Clock } from "@/lib/clock";
import { getDb, type Db, type Tx } from "@/lib/db/client";
import { withClockTx } from "@/lib/db/tx";
import { log } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { ProviderError, type PaymentProvider, type ProviderMode } from "@/lib/razorpay/provider";
import { getPaymentProvider } from "@/lib/razorpay/client";
import { paymentAttempts, refunds } from "./schema";
import { enqueue, backoffMinutes } from "./outbox";
import { reservedRefundPaise, type RefundRow } from "./refunds";

type Deps = { clock?: Clock; db?: Db; provider?: PaymentProvider };

const MAX_SUBMIT_ATTEMPTS = 10;

export const providerRefundSchema = z.object({
  id: z.string(),
  payment_id: z.string(),
  amount: z.number().int(),
  currency: z.string().default("INR"),
  status: z.enum(["pending", "processed", "failed"]),
  receipt: z.string().nullable().optional(),
  notes: z.union([z.record(z.string(), z.string()), z.array(z.unknown())]).optional(),
});
export type ProviderRefundLike = z.infer<typeof providerRefundSchema>;

function mapState(status: ProviderRefundLike["status"]): "processing" | "processed" | "failed" {
  return status === "processed" ? "processed" : status === "failed" ? "failed" : "processing";
}

function notesOf(refund: ProviderRefundLike): Record<string, string> {
  return Array.isArray(refund.notes) ? {} : (refund.notes ?? {});
}

/**
 * Applies verified provider evidence about a refund. Matches by provider refund ID, then by our refund ID in notes.
 * Unknown refunds (for example, issued from the dashboard) are recorded with origin "provider" so totals stay honest.
 */
export async function syncProviderRefund(tx: Tx, input: { mode: ProviderMode; refund: ProviderRefundLike; now: Date }): Promise<RefundRow | null> {
  const state = mapState(input.refund.status);
  const [byProviderId] = await tx.select().from(refunds).where(and(eq(refunds.providerRefundId, input.refund.id), eq(refunds.mode, input.mode))).for("update");
  const localId = notesOf(input.refund).refund_id;
  const [byLocalId] = byProviderId || !localId ? [undefined] : await tx.select().from(refunds).where(eq(refunds.id, localId)).for("update");
  const target = byProviderId ?? byLocalId;
  if (target) {
    if (target.state === "processed" && state !== "processed") return target; // never regress verified evidence
    const [updated] = await tx
      .update(refunds)
      .set({ providerRefundId: input.refund.id, state, processedAt: state === "processed" ? (target.processedAt ?? input.now) : target.processedAt, lastError: state === "failed" ? "Provider reported the refund as failed" : target.lastError, updatedAt: input.now })
      .where(eq(refunds.id, target.id))
      .returning();
    if (state !== target.state) {
      if (updated.bookingId) await enqueue(tx, "email.refund_update", `email.refund_update:${updated.id}:${state}`, { bookingId: updated.bookingId, refundId: updated.id });
      if (state === "failed") await enqueue(tx, "alert.finance", `alert.refund_failed:${updated.id}`, { refundId: updated.id, bookingId: updated.bookingId });
    }
    return updated;
  }
  const [payment] = await tx.select().from(paymentAttempts).where(and(eq(paymentAttempts.providerPaymentId, input.refund.payment_id), eq(paymentAttempts.mode, input.mode))).limit(1);
  if (!payment) {
    await enqueue(tx, "alert.finance", `alert.unknown_refund:${input.refund.id}`, { providerRefundId: input.refund.id, providerPaymentId: input.refund.payment_id });
    return null;
  }
  const [inserted] = await tx
    .insert(refunds)
    .values({
      paymentAttemptId: payment.id,
      bookingId: payment.bookingId,
      mode: input.mode,
      amountPaise: input.refund.amount,
      reason: "Recorded from provider (not initiated by the app).",
      origin: "provider",
      idempotencyKey: `provider:${input.mode}:${input.refund.id}`,
      receipt: input.refund.receipt ?? null,
      providerRefundId: input.refund.id,
      state,
      processedAt: state === "processed" ? input.now : null,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) {
    await enqueue(tx, "alert.finance", `alert.provider_refund:${inserted.id}`, { refundId: inserted.id, bookingId: inserted.bookingId, message: "Refund issued outside the app was recorded." });
    await audit(tx, { actorType: "provider", operation: "refund.recorded_from_provider", entityType: "refund", entityId: inserted.id, metadata: { providerRefundId: input.refund.id } });
  }
  return inserted ?? null;
}

/** Fetches every provider refund for a payment and syncs them. Returns the total non-failed provider amount. */
export async function reconcilePaymentRefunds(paymentAttemptId: string, deps: Deps = {}): Promise<void> {
  const provider = deps.provider ?? getPaymentProvider();
  const db = deps.db ?? getDb();
  const [payment] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, paymentAttemptId)).limit(1);
  if (!payment) return;
  const list = await provider.fetchPaymentRefunds(payment.providerPaymentId);
  await withClockTx(async (tx, now) => {
    for (const item of list) {
      const parsed = providerRefundSchema.safeParse(item);
      if (parsed.success) await syncProviderRefund(tx, { mode: provider.mode, refund: parsed.data, now });
    }
  }, deps);
}

/**
 * Submits one refund operation to the provider with its immutable request and idempotency key.
 * Before any new provider call, provider-side refunds for the payment are reconciled so a dashboard refund or a lost
 * response can never cause a second refund. Timeouts keep the operation pending for a later retry.
 */
export async function submitRefund(refundId: string, deps: Deps = {}): Promise<RefundRow | null> {
  const provider = deps.provider ?? getPaymentProvider();
  const db = deps.db ?? getDb();
  const [refund] = await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
  if (!refund) return null;
  if (refund.state === "processed" || refund.state === "failed") return refund;
  if (refund.origin === "provider") return refund;
  const [payment] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, refund.paymentAttemptId)).limit(1);
  if (!payment || !refund.requestBody) return refund;

  // Reconcile first: adopt a refund the provider already has for this operation.
  try {
    await reconcilePaymentRefunds(payment.id, { ...deps, provider, db });
  } catch (error: unknown) {
    log.warn("refund.reconcile_failed", { refundId, error });
    return scheduleRetry(db, refund, error instanceof Error ? error.message : String(error), deps.clock);
  }
  const [afterSync] = await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
  if (afterSync.providerRefundId) return afterSync;

  // Guard: reserved + processed refunds on the payment must stay within the captured amount.
  const overLimit = await withClockTx(async (tx) => {
    const others = await reservedRefundPaise(tx, payment.id, refund.id);
    return others + refund.amountPaise > payment.amountPaise;
  }, deps);
  if (overLimit) {
    return markFailed(db, refund, "Refund would exceed the captured amount after reconciling provider refunds.", deps.clock);
  }

  await db.update(refunds).set({ state: "processing", attempts: refund.attempts + 1, updatedAt: new Date() }).where(eq(refunds.id, refund.id));
  try {
    const providerRefund = await provider.createRefund(payment.providerPaymentId, refund.requestBody, refund.idempotencyKey);
    return await withClockTx(async (tx, now) => {
      const parsed = providerRefundSchema.parse(providerRefund);
      const synced = await syncProviderRefund(tx, { mode: provider.mode, refund: parsed, now });
      await audit(tx, { actorType: "system", operation: "refund.submitted", entityType: "refund", entityId: refund.id, metadata: { providerRefundId: parsed.id, status: parsed.status } });
      return synced;
    }, deps);
  } catch (error: unknown) {
    if (error instanceof ProviderError && error.uncertain) {
      log.warn("refund.submit_uncertain", { refundId, kind: error.kind });
      return scheduleRetry(db, refund, error.message, deps.clock);
    }
    const message = error instanceof Error ? error.message : String(error);
    return markFailed(db, refund, message, deps.clock);
  }
}

async function scheduleRetry(db: Db, refund: RefundRow, message: string, clock?: Clock): Promise<RefundRow> {
  const now = clock ? clock.now() : new Date();
  const attempts = refund.attempts + 1;
  if (attempts >= MAX_SUBMIT_ATTEMPTS) return markFailed(db, refund, `Gave up after ${attempts} attempts: ${message}`, clock);
  const [updated] = await db
    .update(refunds)
    .set({ state: "processing", lastError: message, nextRetryAt: new Date(now.getTime() + backoffMinutes(attempts) * 60_000), updatedAt: now })
    .where(eq(refunds.id, refund.id))
    .returning();
  await enqueue(db, "refund.submit", `refund.submit:${refund.id}:retry:${attempts}`, { refundId: refund.id });
  return updated;
}

async function markFailed(db: Db, refund: RefundRow, message: string, clock?: Clock): Promise<RefundRow> {
  const now = clock ? clock.now() : new Date();
  const [updated] = await db.update(refunds).set({ state: "failed", lastError: message, updatedAt: now }).where(eq(refunds.id, refund.id)).returning();
  await enqueue(db, "alert.finance", `alert.refund_failed:${refund.id}`, { refundId: refund.id, bookingId: refund.bookingId, message });
  if (refund.bookingId) await enqueue(db, "email.refund_update", `email.refund_update:${refund.id}:failed`, { bookingId: refund.bookingId, refundId: refund.id });
  log.error("refund.failed", { refundId: refund.id, message });
  return updated;
}
