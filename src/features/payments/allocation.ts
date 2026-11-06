import "@/lib/server-guard";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { lockDeparture, lockBooking, lockInstalment, type BookingRow, type DepartureRow, type InstalmentRow } from "@/features/bookings/locks";
import { transitionToUnderReview, transitionToConfirmed } from "@/features/bookings/transitions";
import { bookings } from "@/features/bookings/schema";
import { allocations, gatewayOrders, instalments, paymentAttempts } from "./schema";
import { enqueue } from "./outbox";
import { createUnappliedChargeRefund } from "./refunds";
import type { ProviderMode, ProviderPaymentStatus } from "@/lib/razorpay/provider";

export type ProviderPaymentLike = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: ProviderPaymentStatus | string;
  method?: string | null;
  error_code?: string | null;
  error_description?: string | null;
};

export type PaymentAttemptRow = typeof paymentAttempts.$inferSelect;

export type ApplyOutcome =
  | { outcome: "applied"; bookingState: "UNDER_REVIEW" | "CONFIRMED"; bookingId: string }
  | { outcome: "already_applied"; bookingId: string | null }
  | { outcome: "unapplied_late" | "unapplied_duplicate" | "unapplied_mismatch"; bookingId: string | null; refundQueued: boolean }
  | { outcome: "not_captured"; bookingId: string | null };

type Mapping = { order: typeof gatewayOrders.$inferSelect; booking: BookingRow; departure: DepartureRow; instalment: InstalmentRow };

async function lockMapping(tx: Tx, providerOrderId: string | null, mode: ProviderMode): Promise<Mapping | null> {
  if (!providerOrderId) return null;
  const [order] = await tx
    .select()
    .from(gatewayOrders)
    .where(and(eq(gatewayOrders.providerOrderId, providerOrderId), eq(gatewayOrders.mode, mode)))
    .limit(1);
  if (!order) return null;
  const [peek] = await tx.select({ departureId: bookings.departureId }).from(bookings).where(eq(bookings.id, order.bookingId)).limit(1);
  if (!peek) return null;
  const departure = await lockDeparture(tx, peek.departureId);
  const booking = await lockBooking(tx, order.bookingId);
  const instalment = await lockInstalment(tx, order.instalmentId);
  return { order, booking, departure, instalment };
}

/** Normalises provider status strings into our enum. Unknown values are treated as "created". */
function normaliseStatus(status: string): ProviderPaymentStatus {
  return status === "captured" || status === "authorized" || status === "failed" || status === "refunded" ? status : "created";
}

/**
 * Records a provider payment (from Checkout callback, webhook or reconciliation) and, when captured,
 * applies it to the booking under the standard lock order. Idempotent per provider payment ID.
 * State is monotonic: a captured attempt is never downgraded by a late "failed" event.
 */
export async function recordProviderPayment(
  tx: Tx,
  input: { mode: ProviderMode; payment: ProviderPaymentLike; source: "callback" | "webhook" | "reconcile"; now: Date },
): Promise<{ attempt: PaymentAttemptRow; result: ApplyOutcome }> {
  const mapping = await lockMapping(tx, input.payment.order_id, input.mode);
  const incoming = normaliseStatus(input.payment.status);

  const [attempt] = await tx
    .insert(paymentAttempts)
    .values({
      mode: input.mode,
      providerPaymentId: input.payment.id,
      providerOrderId: input.payment.order_id,
      gatewayOrderId: mapping?.order.id ?? null,
      bookingId: mapping?.booking.id ?? null,
      amountPaise: input.payment.amount,
      currency: input.payment.currency,
      status: incoming,
      method: input.payment.method ?? null,
      source: input.source,
      capturedAt: incoming === "captured" ? input.now : null,
      failedAt: incoming === "failed" ? input.now : null,
      errorCode: input.payment.error_code ?? null,
      errorDescription: input.payment.error_description ?? null,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [paymentAttempts.providerPaymentId, paymentAttempts.mode],
      set: {
        status: sql`case when ${paymentAttempts.status} in ('captured','refunded') then ${paymentAttempts.status} else ${sql.raw(`'${incoming}'`)}::payment_status end`,
        capturedAt: sql`coalesce(${paymentAttempts.capturedAt}, ${incoming === "captured" ? input.now : null}::timestamptz)`,
        failedAt: sql`case when ${paymentAttempts.status} in ('captured','refunded') then ${paymentAttempts.failedAt} else coalesce(${paymentAttempts.failedAt}, ${incoming === "failed" ? input.now : null}::timestamptz) end`,
        errorCode: sql`case when ${paymentAttempts.status} in ('captured','refunded') then ${paymentAttempts.errorCode} else coalesce(${input.payment.error_code ?? null}, ${paymentAttempts.errorCode}) end`,
        bookingId: sql`coalesce(${paymentAttempts.bookingId}, ${mapping?.booking.id ?? null}::uuid)`,
        gatewayOrderId: sql`coalesce(${paymentAttempts.gatewayOrderId}, ${mapping?.order.id ?? null}::uuid)`,
        updatedAt: input.now,
      },
    })
    .returning();

  if (attempt.status !== "captured" && attempt.status !== "refunded") {
    return { attempt, result: { outcome: "not_captured", bookingId: mapping?.booking.id ?? null } };
  }

  const [existingAllocation] = await tx.select().from(allocations).where(eq(allocations.paymentAttemptId, attempt.id)).limit(1);
  if (existingAllocation) {
    return { attempt, result: { outcome: "already_applied", bookingId: existingAllocation.bookingId } };
  }

  if (!mapping) {
    await tx.insert(allocations).values({ paymentAttemptId: attempt.id, outcome: "unapplied_mismatch", amountPaise: attempt.amountPaise, note: "No local order for provider order" });
    await enqueue(tx, "alert.finance", `alert.unmapped_payment:${attempt.id}`, { paymentAttemptId: attempt.id, providerPaymentId: attempt.providerPaymentId, message: "Captured payment has no matching order. Quarantined for finance." });
    return { attempt, result: { outcome: "unapplied_mismatch", bookingId: null, refundQueued: false } };
  }

  const { booking, departure, instalment } = mapping;

  if (attempt.amountPaise !== instalment.amountPaise || attempt.currency !== "INR") {
    await tx.insert(allocations).values({ paymentAttemptId: attempt.id, instalmentId: null, bookingId: booking.id, outcome: "unapplied_mismatch", amountPaise: attempt.amountPaise, note: `Expected ${instalment.amountPaise} INR` });
    await enqueue(tx, "alert.finance", `alert.amount_mismatch:${attempt.id}`, { paymentAttemptId: attempt.id, bookingId: booking.id, expected: instalment.amountPaise, received: attempt.amountPaise, currency: attempt.currency });
    return { attempt, result: { outcome: "unapplied_mismatch", bookingId: booking.id, refundQueued: false } };
  }

  const [applied] = await tx
    .select({ id: allocations.id })
    .from(allocations)
    .where(and(eq(allocations.instalmentId, instalment.id), eq(allocations.outcome, "applied")))
    .limit(1);
  if (applied || instalment.status === "paid") {
    await tx.insert(allocations).values({ paymentAttemptId: attempt.id, instalmentId: null, bookingId: booking.id, outcome: "unapplied_duplicate", amountPaise: attempt.amountPaise, note: "Instalment already paid" });
    const refund = await createUnappliedChargeRefund(tx, { payment: attempt, bookingId: booking.id, bookingReference: booking.reference, reason: "Duplicate payment for an instalment that was already paid." });
    await audit(tx, { actorType: "provider", operation: "payment.duplicate", entityType: "booking", entityId: booking.id, metadata: { paymentAttemptId: attempt.id } });
    return { attempt, result: { outcome: "unapplied_duplicate", bookingId: booking.id, refundQueued: Boolean(refund) } };
  }

  const inTime =
    instalment.kind === "deposit"
      ? booking.state === "HELD" && booking.holdExpiresAt !== null && booking.holdExpiresAt.getTime() > input.now.getTime()
      : booking.state === "BALANCE_DUE" && booking.balanceDueAt !== null && booking.balanceDueAt.getTime() > input.now.getTime();

  if (!inTime) {
    await tx.insert(allocations).values({ paymentAttemptId: attempt.id, instalmentId: null, bookingId: booking.id, outcome: "unapplied_late", amountPaise: attempt.amountPaise, note: `Booking state ${booking.state} at ${input.now.toISOString()}` });
    const refund = await createUnappliedChargeRefund(tx, { payment: attempt, bookingId: booking.id, bookingReference: booking.reference, reason: "Payment arrived after the booking window closed." });
    await enqueue(tx, "email.refund_update", `email.refund_update:late:${attempt.id}`, { bookingId: booking.id, paymentAttemptId: attempt.id, reason: "late" });
    await audit(tx, { actorType: "provider", operation: "payment.late", entityType: "booking", entityId: booking.id, metadata: { paymentAttemptId: attempt.id, state: booking.state } });
    return { attempt, result: { outcome: "unapplied_late", bookingId: booking.id, refundQueued: Boolean(refund) } };
  }

  await tx.insert(allocations).values({ paymentAttemptId: attempt.id, instalmentId: instalment.id, bookingId: booking.id, outcome: "applied", amountPaise: attempt.amountPaise });
  await tx.update(instalments).set({ status: "paid", paidAt: input.now }).where(eq(instalments.id, instalment.id));
  await tx.update(gatewayOrders).set({ requestState: "paid", updatedAt: input.now }).where(eq(gatewayOrders.id, mapping.order.id));

  if (instalment.kind === "deposit") {
    await transitionToUnderReview(tx, booking, departure, input.now);
    return { attempt, result: { outcome: "applied", bookingState: "UNDER_REVIEW", bookingId: booking.id } };
  }
  await transitionToConfirmed(tx, booking, input.now);
  return { attempt, result: { outcome: "applied", bookingState: "CONFIRMED", bookingId: booking.id } };
}
