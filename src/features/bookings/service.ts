import "@/lib/server-guard";
import { and, asc, count, desc, eq, inArray, lte } from "drizzle-orm";
import type { Clock } from "@/lib/clock";
import { getDb, type Db, type DbOrTx, type Tx } from "@/lib/db/client";
import { withClockTx, retryTx } from "@/lib/db/tx";
import { errors } from "@/lib/errors";
import { newBookingReference } from "@/lib/ids";
import { splitInstalments } from "@/lib/money";
import { addMinutes } from "@/lib/time";
import { audit } from "@/lib/audit";
import { departures, policyVersions, trips, hosts } from "@/features/trips/schema";
import { instalments, paymentAttempts, allocations, refunds, gatewayOrders } from "@/features/payments/schema";
import { reviews } from "@/features/verification/schema";
import { bookings, cancelQuotes, cancellations, ACTIVE_BOOKING_STATES, type QuizSnapshot, type RefundBreakdown } from "./schema";
import { lockDeparture, lockBookingChain, type BookingRow, type DepartureRow } from "./locks";
import { closeBookingWithRefunds, capturedPaymentsFor } from "./transitions";
import { computeRefundQuote } from "./policy";
import { enqueue } from "@/features/payments/outbox";

export type Deps = { clock?: Clock; db?: Db };

export async function activeBookingCount(db: DbOrTx, departureId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(bookings)
    .where(and(eq(bookings.departureId, departureId), inArray(bookings.state, ACTIVE_BOOKING_STATES)));
  return Number(row?.n ?? 0);
}

export type CreateHoldInput = {
  userId: string;
  departureId: string;
  quoteVersion: number;
  policyVersionId: string;
  travellerAge: number;
  quiz: QuizSnapshot | null;
  attestations: { single: true; conduct: true; policy: true };
  clientOperationKey?: string;
};

export type CreateHoldResult = { booking: BookingRow; created: boolean };

/**
 * Reserves one seat for an eligible, signed-in traveller. Re-reads price and inventory under the departure lock.
 * Returns the existing active booking for the same owner and departure (idempotent on retry/double-click).
 */
export async function createHold(input: CreateHoldInput, deps: Deps = {}): Promise<CreateHoldResult> {
  return retryTx(() =>
    withClockTx(async (tx, now) => {
      const departure = await lockDeparture(tx, input.departureId);
      const [existing] = await tx
        .select()
        .from(bookings)
        .where(and(eq(bookings.ownerId, input.userId), eq(bookings.departureId, departure.id), inArray(bookings.state, ACTIVE_BOOKING_STATES)))
        .limit(1);
      if (existing) return { booking: existing, created: false };

      if (input.clientOperationKey) {
        const [byKey] = await tx
          .select()
          .from(bookings)
          .where(and(eq(bookings.ownerId, input.userId), eq(bookings.clientOperationKey, input.clientOperationKey)))
          .limit(1);
        if (byKey) return { booking: byKey, created: false };
      }

      if (departure.status !== "published") throw errors.conflict("NOT_OPEN", "This departure is not open for booking.");
      if (departure.salesCloseAt.getTime() <= now.getTime()) throw errors.conflict("SALES_CLOSED", "Sales for this departure have closed.");
      if (!Number.isInteger(input.travellerAge) || input.travellerAge < 18) throw errors.invalid("You must be 18 or older to book.");
      if (input.travellerAge < departure.minAge || input.travellerAge > departure.maxAge) {
        throw errors.conflict("AGE_INELIGIBLE", `This departure is for travellers aged ${departure.minAge} to ${departure.maxAge}.`);
      }
      if (departure.version !== input.quoteVersion || departure.policyVersionId !== input.policyVersionId) {
        throw errors.conflict("QUOTE_CHANGED", "The price or terms changed while you were reviewing. Please review the updated quote.", {
          quoteVersion: departure.version,
          policyVersionId: departure.policyVersionId,
        });
      }
      const allocated = await activeBookingCount(tx, departure.id);
      if (allocated >= departure.capacity) throw errors.conflict("SOLD_OUT", "The last seat was just taken. You can join the waitlist.");

      const { depositPaise, balancePaise } = splitInstalments(departure.totalPaise, departure.depositBps);
      const [policy] = await tx.select().from(policyVersions).where(eq(policyVersions.id, departure.policyVersionId)).limit(1);
      if (!policy) throw errors.conflict("QUOTE_CHANGED", "Policy version missing.");

      const [booking] = await tx
        .insert(bookings)
        .values({
          reference: newBookingReference(),
          ownerId: input.userId,
          departureId: departure.id,
          state: "HELD",
          holdExpiresAt: addMinutes(now, departure.holdMinutes),
          totalPaise: departure.totalPaise,
          depositPaise,
          balancePaise,
          quoteVersion: departure.version,
          taxesNote: departure.taxesNote,
          policyVersionId: policy.id,
          policyRules: policy.rules,
          quizSnapshot: input.quiz,
          travellerAge: input.travellerAge,
          singleAttestedAt: now,
          conductAcceptedAt: now,
          policyAcceptedAt: now,
          clientOperationKey: input.clientOperationKey ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await tx.insert(instalments).values({ bookingId: booking.id, kind: "deposit", amountPaise: depositPaise, dueAt: booking.holdExpiresAt });
      await audit(tx, {
        actorType: "user",
        actorUserId: input.userId,
        operation: "booking.held",
        entityType: "booking",
        entityId: booking.id,
        metadata: { departureId: departure.id, totalPaise: departure.totalPaise, depositPaise, holdExpiresAt: booking.holdExpiresAt },
      });
      return { booking, created: true };
    }, deps),
  );
}

/** Expires lapsed holds and balance windows. Each booking is handled in its own transaction under the standard locks. */
export async function expireDueBookings(deps: Deps = {}): Promise<{ holdsExpired: number; balancesExpired: number }> {
  const db = deps.db ?? getDb();
  const now = deps.clock ? deps.clock.now() : new Date();
  const dueHolds = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.state, "HELD"), lte(bookings.holdExpiresAt, now)))
    .limit(200);
  let holdsExpired = 0;
  for (const { id } of dueHolds) {
    const done = await withClockTx(async (tx, txNow) => {
      const { departure, booking } = await lockBookingChain(tx, id);
      if (booking.state !== "HELD" || !booking.holdExpiresAt || booking.holdExpiresAt.getTime() > txNow.getTime()) return false;
      await closeBookingWithRefunds(tx, { booking, departure, now: txNow, newState: "EXPIRED", origin: "balance_timeout", reason: "Deposit not received before the hold expired." });
      await enqueue(tx, "email.hold_expired", `email.hold_expired:${booking.id}`, { bookingId: booking.id });
      return true;
    }, deps);
    if (done) holdsExpired += 1;
  }

  const dueBalances = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.state, "BALANCE_DUE"), lte(bookings.balanceDueAt, now)))
    .limit(200);
  let balancesExpired = 0;
  for (const { id } of dueBalances) {
    const done = await withClockTx(async (tx, txNow) => {
      const { departure, booking } = await lockBookingChain(tx, id);
      if (booking.state !== "BALANCE_DUE" || !booking.balanceDueAt || booking.balanceDueAt.getTime() > txNow.getTime()) return false;
      await closeBookingWithRefunds(tx, { booking, departure, now: txNow, newState: "EXPIRED", origin: "balance_timeout", reason: "Balance not received before the deadline." });
      await enqueue(tx, "email.balance_expired", `email.balance_expired:${booking.id}`, { bookingId: booking.id });
      return true;
    }, deps);
    if (done) balancesExpired += 1;
  }
  return { holdsExpired, balancesExpired };
}

const QUOTE_TTL_MINUTES = 10;

/** Previews the exact refund for a traveller cancellation. The quote is short-lived and tied to the booking revision. */
export async function createCancelQuote(input: { bookingId: string; userId: string }, deps: Deps = {}) {
  return withClockTx(async (tx, now) => {
    const { departure, booking } = await lockBookingChain(tx, input.bookingId);
    if (booking.ownerId !== input.userId) throw errors.notFound("Booking not found.");
    if (!ACTIVE_BOOKING_STATES.includes(booking.state)) throw errors.conflict("NOT_ACTIVE", "This booking is no longer active.");
    const captures = await capturedPaymentsFor(tx, booking.id);
    const breakdown = computeRefundQuote({ rules: booking.policyRules, origin: "traveller", startDate: departure.startDate, now, captures });
    const [quote] = await tx
      .insert(cancelQuotes)
      .values({ bookingId: booking.id, bookingRevision: booking.revision, refundPaise: breakdown.refundPaise, breakdown, expiresAt: addMinutes(now, QUOTE_TTL_MINUTES), createdAt: now })
      .returning();
    return { quote, breakdown, expiresAt: quote.expiresAt };
  }, deps);
}

/** Commits a traveller cancellation against a valid quote. Idempotent: a second call returns the recorded cancellation. */
export async function cancelBookingByTraveller(input: { bookingId: string; userId: string; quoteId: string }, deps: Deps = {}) {
  return withClockTx(async (tx, now) => {
    const { departure, booking } = await lockBookingChain(tx, input.bookingId);
    if (booking.ownerId !== input.userId) throw errors.notFound("Booking not found.");
    const [existing] = await tx.select().from(cancellations).where(eq(cancellations.bookingId, booking.id)).limit(1);
    if (existing && booking.state === "CANCELLED") return { breakdown: existing.breakdown, replayed: true };
    if (!ACTIVE_BOOKING_STATES.includes(booking.state)) throw errors.conflict("NOT_ACTIVE", "This booking is no longer active.");
    const [quote] = await tx.select().from(cancelQuotes).where(and(eq(cancelQuotes.id, input.quoteId), eq(cancelQuotes.bookingId, booking.id))).limit(1);
    if (!quote) throw errors.notFound("Cancellation quote not found.");
    if (quote.expiresAt.getTime() <= now.getTime() || quote.bookingRevision !== booking.revision) {
      throw errors.conflict("QUOTE_EXPIRED", "Your cancellation quote has expired. Please review the updated amount.");
    }
    const captures = await capturedPaymentsFor(tx, booking.id);
    const fresh = computeRefundQuote({ rules: booking.policyRules, origin: "traveller", startDate: departure.startDate, now, captures });
    if (fresh.refundPaise !== quote.refundPaise) {
      throw errors.conflict("QUOTE_CHANGED", "The refund amount changed. Please review the updated quote.", { refundPaise: fresh.refundPaise });
    }
    const breakdown = await closeBookingWithRefunds(tx, {
      booking,
      departure,
      now,
      newState: "CANCELLED",
      origin: "traveller",
      reason: "Cancelled by traveller.",
      actorUserId: input.userId,
      quoteId: quote.id,
      expectedBreakdown: quote.breakdown,
    });
    await enqueue(tx, "email.cancelled", `email.cancelled:${booking.id}`, { bookingId: booking.id });
    return { breakdown, replayed: false };
  }, deps);
}

/** Operator cancellation of a single booking: full refund of all captured instalments. */
export async function cancelBookingByOperator(input: { bookingId: string; actorUserId: string; reason: string }, deps: Deps = {}) {
  return withClockTx(async (tx, now) => {
    const { departure, booking } = await lockBookingChain(tx, input.bookingId);
    if (!ACTIVE_BOOKING_STATES.includes(booking.state)) throw errors.conflict("NOT_ACTIVE", "This booking is no longer active.");
    const breakdown = await closeBookingWithRefunds(tx, {
      booking,
      departure,
      now,
      newState: "CANCELLED",
      origin: "operator",
      reason: input.reason,
      actorUserId: input.actorUserId,
    });
    await enqueue(tx, "email.cancelled", `email.cancelled:${booking.id}`, { bookingId: booking.id });
    return breakdown;
  }, deps);
}

/** Cancels every active booking on a departure (operator cancels the trip). */
export async function cancelDepartureBookings(tx: Tx, departure: DepartureRow, actorUserId: string, reason: string, now: Date) {
  const rows = await tx
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.departureId, departure.id), inArray(bookings.state, ACTIVE_BOOKING_STATES)))
    .orderBy(asc(bookings.createdAt));
  const results: RefundBreakdown[] = [];
  for (const { id } of rows) {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, id)).for("update");
    const breakdown = await closeBookingWithRefunds(tx, {
      booking,
      departure,
      now,
      newState: "CANCELLED",
      origin: "departure_cancelled",
      reason,
      actorUserId,
    });
    await enqueue(tx, "email.cancelled", `email.cancelled:${booking.id}`, { bookingId: booking.id });
    results.push(breakdown);
  }
  return results;
}

/** Marks confirmed bookings completed after the trip returns. */
export async function completeDepartureBookings(tx: Tx, departureId: string, now: Date): Promise<number> {
  const rows = await tx
    .update(bookings)
    .set({ state: "COMPLETED", closedAt: now, updatedAt: now })
    .where(and(eq(bookings.departureId, departureId), eq(bookings.state, "CONFIRMED")))
    .returning({ id: bookings.id });
  return rows.length;
}

// ---- Read models

export type BookingDetail = Awaited<ReturnType<typeof loadBookingDetail>>;

/** Full booking view for the owner or scoped staff. Returns null when not found. */
export async function loadBookingDetail(bookingId: string, db: DbOrTx = getDb()) {
  const [row] = await db
    .select({
      booking: bookings,
      departure: departures,
      trip: trips,
      host: hosts,
    })
    .from(bookings)
    .innerJoin(departures, eq(bookings.departureId, departures.id))
    .innerJoin(trips, eq(departures.tripId, trips.id))
    .innerJoin(hosts, eq(departures.hostId, hosts.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return null;
  const [instalmentRows, attemptRows, refundRows, reviewRows, cancellationRows, orderRows] = await Promise.all([
    db.select().from(instalments).where(eq(instalments.bookingId, bookingId)).orderBy(asc(instalments.createdAt)),
    db.select().from(paymentAttempts).where(eq(paymentAttempts.bookingId, bookingId)).orderBy(desc(paymentAttempts.createdAt)),
    db.select().from(refunds).where(eq(refunds.bookingId, bookingId)).orderBy(desc(refunds.createdAt)),
    db.select().from(reviews).where(eq(reviews.bookingId, bookingId)).limit(1),
    db.select().from(cancellations).where(eq(cancellations.bookingId, bookingId)).limit(1),
    db.select().from(gatewayOrders).where(eq(gatewayOrders.bookingId, bookingId)).orderBy(desc(gatewayOrders.createdAt)),
  ]);
  const allocationRows = await db.select().from(allocations).where(eq(allocations.bookingId, bookingId));
  return {
    ...row,
    instalments: instalmentRows,
    payments: attemptRows,
    refunds: refundRows,
    review: reviewRows[0] ?? null,
    cancellation: cancellationRows[0] ?? null,
    orders: orderRows,
    allocations: allocationRows,
  };
}

export async function listBookingsForOwner(userId: string, db: DbOrTx = getDb()) {
  return db
    .select({ booking: bookings, departure: departures, trip: trips })
    .from(bookings)
    .innerJoin(departures, eq(bookings.departureId, departures.id))
    .innerJoin(trips, eq(departures.tripId, trips.id))
    .where(eq(bookings.ownerId, userId))
    .orderBy(desc(bookings.createdAt));
}

/** What the traveller can do next, derived on the server from the authoritative state. */
export function allowedActions(detail: NonNullable<BookingDetail>, now = new Date()) {
  const b = detail.booking;
  const actions: string[] = [];
  if (b.state === "HELD" && b.holdExpiresAt && b.holdExpiresAt.getTime() > now.getTime()) actions.push("pay_deposit");
  if (b.state === "UNDER_REVIEW") actions.push("request_review_call");
  if (b.state === "BALANCE_DUE" && b.balanceDueAt && b.balanceDueAt.getTime() > now.getTime()) actions.push("pay_balance");
  if (ACTIVE_BOOKING_STATES.includes(b.state)) actions.push("cancel_quote");
  if (b.state === "CONFIRMED" || b.state === "COMPLETED") actions.push("circle");
  if (detail.refunds.some((r) => r.state === "failed")) actions.push("contact_support");
  return actions;
}
