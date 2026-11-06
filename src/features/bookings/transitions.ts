import "@/lib/server-guard";
import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { addHours } from "@/lib/time";
import { bookings, cancellations, type BookingState, type CancellationOrigin, type RefundBreakdown } from "./schema";
import { instalments, gatewayOrders, allocations, paymentAttempts } from "@/features/payments/schema";
import { reviews } from "@/features/verification/schema";
import { circlePreferences } from "@/features/circle/schema";
import { enqueue } from "@/features/payments/outbox";
import { createRefundObligations, reservedRefundPaise } from "@/features/payments/refunds";
import { computeRefundQuote, type CapturedPayment } from "./policy";
import type { BookingRow, DepartureRow } from "./locks";

/** Captured payments applied to a booking, with what is still refundable on each. */
export async function capturedPaymentsFor(tx: Tx, bookingId: string): Promise<CapturedPayment[]> {
  const rows = await tx
    .select({
      paymentAttemptId: paymentAttempts.id,
      capturedPaise: paymentAttempts.amountPaise,
      kind: instalments.kind,
    })
    .from(allocations)
    .innerJoin(paymentAttempts, eq(allocations.paymentAttemptId, paymentAttempts.id))
    .innerJoin(instalments, eq(allocations.instalmentId, instalments.id))
    .where(and(eq(allocations.bookingId, bookingId), eq(allocations.outcome, "applied")));
  const out: CapturedPayment[] = [];
  for (const row of rows) {
    out.push({
      paymentAttemptId: row.paymentAttemptId,
      instalment: row.kind,
      capturedPaise: row.capturedPaise,
      alreadyRefundedPaise: await reservedRefundPaise(tx, row.paymentAttemptId),
    });
  }
  return out;
}

/** Voids pending instalments and any payable provider orders so no new money can arrive for a closed booking. */
async function voidOpenObligations(tx: Tx, bookingId: string) {
  await tx
    .update(instalments)
    .set({ status: "void" })
    .where(and(eq(instalments.bookingId, bookingId), eq(instalments.status, "pending")));
  await tx
    .update(gatewayOrders)
    .set({ requestState: "void", updatedAt: new Date() })
    .where(and(eq(gatewayOrders.bookingId, bookingId), inArray(gatewayOrders.requestState, ["leased", "created", "uncertain"])));
}

/** Deposit captured in time: the seat is retained for human verification. */
export async function transitionToUnderReview(tx: Tx, booking: BookingRow, departure: DepartureRow, now: Date) {
  const reviewDueAt = addHours(now, departure.reviewHours);
  await tx
    .update(bookings)
    .set({ state: "UNDER_REVIEW", reviewDueAt, holdExpiresAt: null, revision: booking.revision + 1, updatedAt: now })
    .where(eq(bookings.id, booking.id));
  await tx.insert(reviews).values({ bookingId: booking.id, dueAt: reviewDueAt }).onConflictDoNothing();
  await enqueue(tx, "email.deposit_receipt", `email.deposit_receipt:${booking.id}`, { bookingId: booking.id });
  await audit(tx, {
    actorType: "system",
    operation: "booking.under_review",
    entityType: "booking",
    entityId: booking.id,
    metadata: { reviewDueAt },
  });
}

/** Balance captured in time after approval: the trip is confirmed and the circle opens. */
export async function transitionToConfirmed(tx: Tx, booking: BookingRow, now: Date) {
  await tx
    .update(bookings)
    .set({ state: "CONFIRMED", confirmedAt: now, balanceDueAt: null, revision: booking.revision + 1, updatedAt: now })
    .where(eq(bookings.id, booking.id));
  await tx
    .insert(circlePreferences)
    .values({ bookingId: booking.id, userId: booking.ownerId, departureId: booking.departureId })
    .onConflictDoNothing();
  await enqueue(tx, "email.confirmed", `email.confirmed:${booking.id}`, { bookingId: booking.id });
  await audit(tx, { actorType: "system", operation: "booking.confirmed", entityType: "booking", entityId: booking.id });
}

export type CloseInput = {
  booking: BookingRow;
  departure: DepartureRow;
  now: Date;
  newState: Extract<BookingState, "EXPIRED" | "REJECTED" | "CANCELLED">;
  origin: CancellationOrigin;
  reason: string;
  actorUserId?: string | null;
  quoteId?: string | null;
  /** When provided (traveller cancellation), must equal the recomputed quote. */
  expectedBreakdown?: RefundBreakdown;
};

/**
 * Releases the seat, voids open obligations, applies the frozen policy to actual captured funds and
 * queues one refund per original payment. Used by expiry, rejection, traveller and operator cancellation.
 */
export async function closeBookingWithRefunds(tx: Tx, input: CloseInput): Promise<RefundBreakdown> {
  const captures = await capturedPaymentsFor(tx, input.booking.id);
  const breakdown = computeRefundQuote({
    rules: input.booking.policyRules,
    origin: input.origin,
    startDate: input.departure.startDate,
    now: input.now,
    captures,
  });
  await tx
    .update(bookings)
    .set({
      state: input.newState,
      closedAt: input.now,
      holdExpiresAt: null,
      balanceDueAt: null,
      revision: input.booking.revision + 1,
      updatedAt: input.now,
    })
    .where(eq(bookings.id, input.booking.id));
  await voidOpenObligations(tx, input.booking.id);
  // Expired holds with no captured money need no cancellation record.
  let cancellationId: string | null = null;
  if (captures.length > 0 || input.origin !== "balance_timeout") {
    const [cancellation] = await tx
      .insert(cancellations)
      .values({
        bookingId: input.booking.id,
        origin: input.origin,
        quoteId: input.quoteId ?? null,
        capturedPaise: breakdown.capturedPaise,
        refundPaise: breakdown.refundPaise,
        breakdown,
        actorUserId: input.actorUserId ?? null,
        reason: input.reason,
      })
      .onConflictDoNothing()
      .returning();
    cancellationId = cancellation?.id ?? null;
  }
  if (breakdown.refundPaise > 0) {
    await createRefundObligations(tx, {
      bookingId: input.booking.id,
      bookingReference: input.booking.reference,
      cancellationId,
      breakdown,
      reason: input.reason,
      actorUserId: input.actorUserId ?? null,
    });
  }
  await audit(tx, {
    actorType: input.actorUserId ? "user" : "system",
    actorUserId: input.actorUserId ?? null,
    operation: `booking.${input.newState.toLowerCase()}`,
    entityType: "booking",
    entityId: input.booking.id,
    reason: input.reason,
    metadata: { origin: input.origin, refundPaise: breakdown.refundPaise, capturedPaise: breakdown.capturedPaise },
  });
  return breakdown;
}
