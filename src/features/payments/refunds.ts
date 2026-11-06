import "@/lib/server-guard";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import { newId, sha256Hex, shortToken, stableStringify } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { paymentAttempts, refunds, type RefundRequestBody } from "./schema";
import { enqueue } from "./outbox";
import type { RefundBreakdown } from "@/features/bookings/schema";

export type PaymentAttemptRow = typeof paymentAttempts.$inferSelect;
export type RefundRow = typeof refunds.$inferSelect;

/** Sum of refunds that are reserved or processed against a payment (failed ones release their reservation). */
export async function reservedRefundPaise(tx: Tx, paymentAttemptId: string, excludingRefundId?: string): Promise<number> {
  const conditions = [eq(refunds.paymentAttemptId, paymentAttemptId), inArray(refunds.state, ["requested", "processing", "processed"])];
  if (excludingRefundId) conditions.push(ne(refunds.id, excludingRefundId));
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)` })
    .from(refunds)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

async function lockPayment(tx: Tx, paymentAttemptId: string): Promise<PaymentAttemptRow> {
  const [row] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, paymentAttemptId)).for("update");
  if (!row) throw new Error(`payment attempt ${paymentAttemptId} not found`);
  return row;
}

/**
 * Creates one refund operation per original payment and queues its submission.
 * The request body is persisted immutably before any provider call and the UUID doubles as the idempotency key.
 * Reserved + processed refunds can never exceed the captured amount of a payment.
 */
export async function createRefundObligations(
  tx: Tx,
  input: {
    bookingId: string;
    bookingReference: string;
    cancellationId: string | null;
    breakdown: RefundBreakdown;
    reason: string;
    actorUserId?: string | null;
  },
): Promise<RefundRow[]> {
  const created: RefundRow[] = [];
  for (const item of input.breakdown.perPayment) {
    if (item.refundPaise <= 0) continue;
    const payment = await lockPayment(tx, item.paymentAttemptId);
    const reserved = await reservedRefundPaise(tx, payment.id);
    const available = payment.amountPaise - reserved;
    if (available <= 0) {
      await enqueue(tx, "alert.finance", `alert.refund_exceeds:${payment.id}:${input.cancellationId ?? "none"}`, {
        paymentAttemptId: payment.id,
        bookingId: input.bookingId,
        message: "Refund requested but the payment is already fully refunded or reserved.",
      });
      continue;
    }
    const amount = Math.min(item.refundPaise, available);
    if (amount < item.refundPaise) {
      await enqueue(tx, "alert.finance", `alert.refund_truncated:${payment.id}:${input.cancellationId ?? "none"}`, {
        paymentAttemptId: payment.id,
        bookingId: input.bookingId,
        requested: item.refundPaise,
        granted: amount,
      });
    }
    const row = await insertRefund(tx, {
      payment,
      bookingId: input.bookingId,
      bookingReference: input.bookingReference,
      cancellationId: input.cancellationId,
      amountPaise: amount,
      reason: input.reason,
      origin: "app",
      actorUserId: input.actorUserId ?? null,
    });
    created.push(row);
  }
  return created;
}

/** Full refund of a captured charge that could not fulfil a valid booking (late, duplicate). Idempotent per payment. */
export async function createUnappliedChargeRefund(
  tx: Tx,
  input: { payment: PaymentAttemptRow; bookingId: string | null; bookingReference: string | null; reason: string },
): Promise<RefundRow | null> {
  const payment = await lockPayment(tx, input.payment.id);
  const reserved = await reservedRefundPaise(tx, payment.id);
  const available = payment.amountPaise - reserved;
  if (available <= 0) return null;
  return insertRefund(tx, {
    payment,
    bookingId: input.bookingId,
    bookingReference: input.bookingReference ?? "unmapped",
    cancellationId: null,
    amountPaise: available,
    reason: input.reason,
    origin: "unapplied",
    actorUserId: null,
  });
}

async function insertRefund(
  tx: Tx,
  input: {
    payment: PaymentAttemptRow;
    bookingId: string | null;
    bookingReference: string;
    cancellationId: string | null;
    amountPaise: number;
    reason: string;
    origin: "app" | "unapplied";
    actorUserId: string | null;
  },
): Promise<RefundRow> {
  const id = newId();
  const receipt = `rf_${shortToken(12)}`;
  const requestBody: RefundRequestBody = {
    amount: input.amountPaise,
    receipt,
    notes: { refund_id: id, booking_reference: input.bookingReference, reason: input.reason.slice(0, 200) },
  };
  const [row] = await tx
    .insert(refunds)
    .values({
      id,
      paymentAttemptId: input.payment.id,
      bookingId: input.bookingId,
      cancellationId: input.cancellationId,
      mode: input.payment.mode,
      amountPaise: input.amountPaise,
      reason: input.reason,
      origin: input.origin,
      requestBody,
      requestFingerprint: sha256Hex(stableStringify(requestBody)),
      idempotencyKey: id,
      receipt,
      state: "requested",
    })
    .returning();
  await enqueue(tx, "refund.submit", `refund.submit:${id}`, { refundId: id });
  await audit(tx, {
    actorType: input.actorUserId ? "user" : "system",
    actorUserId: input.actorUserId,
    operation: "refund.requested",
    entityType: "refund",
    entityId: id,
    reason: input.reason,
    metadata: { paymentAttemptId: input.payment.id, amountPaise: input.amountPaise, bookingId: input.bookingId },
  });
  return row;
}
