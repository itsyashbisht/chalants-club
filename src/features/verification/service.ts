import "@/lib/server-guard";
import { and, asc, eq, inArray, isNull, lte, desc } from "drizzle-orm";
import type { Clock } from "@/lib/clock";
import { getDb, type Db, type DbOrTx } from "@/lib/db/client";
import { withClockTx, retryTx } from "@/lib/db/tx";
import { errors } from "@/lib/errors";
import { addHours } from "@/lib/time";
import { audit } from "@/lib/audit";
import { users } from "@/lib/db/core-schema";
import { bookings } from "@/features/bookings/schema";
import { departures, trips } from "@/features/trips/schema";
import { instalments } from "@/features/payments/schema";
import { lockBookingChain } from "@/features/bookings/locks";
import { closeBookingWithRefunds } from "@/features/bookings/transitions";
import { enqueue } from "@/features/payments/outbox";
import { reviews, reviewActions, type ReviewCallStatus } from "./schema";

type Deps = { clock?: Clock; db?: Db };

export const REASON_CODES = {
  approved: ["identity_confirmed"],
  info_requested: ["call_missed", "document_unclear", "needs_reschedule", "other"],
  rejected: ["identity_not_confirmed", "age_ineligible", "conduct_policy", "other"],
} as const;

export type DecisionInput = {
  reviewId: string;
  reviewerId: string;
  expectedRevision: number;
  decision: "approved" | "rejected" | "info_requested";
  reasonCode: string;
  note?: string;
};

/**
 * Records a reviewer decision. A stale revision (concurrent decision or replay) returns 409.
 * Approval starts the balance window exactly once; a replayed approval can never extend the deadline.
 */
export async function decideReview(input: DecisionInput, deps: Deps = {}) {
  const allowed = REASON_CODES[input.decision] as readonly string[];
  if (!allowed.includes(input.reasonCode)) throw errors.invalid("Unknown reason code for this decision.");
  return retryTx(() =>
    withClockTx(async (tx, now) => {
      const [review] = await tx.select().from(reviews).where(eq(reviews.id, input.reviewId)).limit(1);
      if (!review) throw errors.notFound("Review not found.");
      const { departure, booking } = await lockBookingChain(tx, review.bookingId);
      const [lockedReview] = await tx.select().from(reviews).where(eq(reviews.id, review.id)).for("update");
      if (lockedReview.revision !== input.expectedRevision) {
        throw errors.conflict("STALE_REVIEW", "This review changed since you loaded it. Reload to see the latest decision.", { revision: lockedReview.revision });
      }
      if (booking.state !== "UNDER_REVIEW") throw errors.conflict("WRONG_STAGE", `Booking is ${booking.state}; decisions apply only while under review.`);
      if (lockedReview.decision === "approved" || lockedReview.decision === "rejected") throw errors.conflict("ALREADY_DECIDED", "This review already has a final decision.");

      await tx.insert(reviewActions).values({ reviewId: review.id, actorUserId: input.reviewerId, action: input.decision, reasonCode: input.reasonCode, note: input.note ?? null, createdAt: now });
      await audit(tx, { actorType: "user", actorUserId: input.reviewerId, operation: `review.${input.decision}`, entityType: "booking", entityId: booking.id, reason: input.reasonCode });

      if (input.decision === "info_requested") {
        const [updated] = await tx
          .update(reviews)
          .set({ decision: "info_requested", reasonCode: input.reasonCode, note: input.note ?? lockedReview.note, reviewerId: input.reviewerId, callStatus: "inconclusive", revision: lockedReview.revision + 1, updatedAt: now })
          .where(eq(reviews.id, review.id))
          .returning();
        await enqueue(tx, "email.info_requested", `email.info_requested:${booking.id}:${updated.revision}`, { bookingId: booking.id });
        return { review: updated, bookingState: booking.state };
      }

      if (input.decision === "approved") {
        const balanceDueAt = addHours(now, departure.balanceWindowHours);
        await tx
          .update(bookings)
          .set({ state: "BALANCE_DUE", approvedAt: now, balanceDueAt, reviewDueAt: null, revision: booking.revision + 1, updatedAt: now })
          .where(eq(bookings.id, booking.id));
        await tx
          .insert(instalments)
          .values({ bookingId: booking.id, kind: "balance", amountPaise: booking.balancePaise, dueAt: balanceDueAt })
          .onConflictDoNothing();
        const [updated] = await tx
          .update(reviews)
          .set({ decision: "approved", reasonCode: input.reasonCode, note: input.note ?? lockedReview.note, reviewerId: input.reviewerId, callStatus: "done", decidedAt: now, revision: lockedReview.revision + 1, updatedAt: now })
          .where(eq(reviews.id, review.id))
          .returning();
        await enqueue(tx, "email.approved", `email.approved:${booking.id}`, { bookingId: booking.id });
        return { review: updated, bookingState: "BALANCE_DUE" as const, balanceDueAt };
      }

      const [updated] = await tx
        .update(reviews)
        .set({ decision: "rejected", reasonCode: input.reasonCode, note: input.note ?? lockedReview.note, reviewerId: input.reviewerId, callStatus: "done", decidedAt: now, revision: lockedReview.revision + 1, updatedAt: now })
        .where(eq(reviews.id, review.id))
        .returning();
      await closeBookingWithRefunds(tx, { booking, departure, now, newState: "REJECTED", origin: "rejection", reason: `Verification not completed (${input.reasonCode}).`, actorUserId: input.reviewerId });
      await enqueue(tx, "email.rejected", `email.rejected:${booking.id}`, { bookingId: booking.id });
      return { review: updated, bookingState: "REJECTED" as const };
    }, deps),
  );
}

/** Traveller requests a private review slot or leaves a contact request for the staffed queue. */
export async function requestReviewCall(input: { bookingId: string; userId: string; note: string }, deps: Deps = {}) {
  return withClockTx(async (tx, now) => {
    const { booking } = await lockBookingChain(tx, input.bookingId);
    if (booking.ownerId !== input.userId) throw errors.notFound("Booking not found.");
    if (booking.state !== "UNDER_REVIEW") throw errors.conflict("WRONG_STAGE", "Review calls can be requested while your booking is under review.");
    const [review] = await tx.select().from(reviews).where(eq(reviews.bookingId, booking.id)).for("update");
    if (!review) throw errors.notFound("Review not found.");
    const [updated] = await tx
      .update(reviews)
      .set({ callStatus: "requested", callRequestNote: input.note.slice(0, 500), callRequestedAt: now, updatedAt: now })
      .where(eq(reviews.id, review.id))
      .returning();
    await tx.insert(reviewActions).values({ reviewId: review.id, actorUserId: input.userId, action: "call_requested", createdAt: now });
    return updated;
  }, deps);
}

export async function setCallStatus(input: { reviewId: string; reviewerId: string; status: ReviewCallStatus; note?: string }, deps: Deps = {}) {
  return withClockTx(async (tx, now) => {
    const [review] = await tx.select().from(reviews).where(eq(reviews.id, input.reviewId)).for("update");
    if (!review) throw errors.notFound("Review not found.");
    const [updated] = await tx
      .update(reviews)
      .set({ callStatus: input.status, reviewerId: review.reviewerId ?? input.reviewerId, updatedAt: now })
      .where(eq(reviews.id, review.id))
      .returning();
    await tx.insert(reviewActions).values({ reviewId: review.id, actorUserId: input.reviewerId, action: `call_${input.status}`, note: input.note ?? null, createdAt: now });
    return updated;
  }, deps);
}

/** Job: reviews past their SLA are escalated to staff once. The seat stays held. */
export async function escalateOverdueReviews(deps: Deps = {}): Promise<number> {
  const db = deps.db ?? getDb();
  const now = deps.clock ? deps.clock.now() : new Date();
  const overdue = await db
    .select({ id: reviews.id, bookingId: reviews.bookingId })
    .from(reviews)
    .where(and(inArray(reviews.decision, ["pending", "info_requested"]), lte(reviews.dueAt, now), isNull(reviews.escalatedAt)))
    .limit(100);
  for (const r of overdue) {
    await db.update(reviews).set({ escalatedAt: now, updatedAt: now }).where(eq(reviews.id, r.id));
    await enqueue(db, "alert.review_overdue", `alert.review_overdue:${r.id}`, { reviewId: r.id, bookingId: r.bookingId });
  }
  return overdue.length;
}

export async function listReviewQueue(db: DbOrTx = getDb()) {
  return db
    .select({
      review: reviews,
      booking: { id: bookings.id, reference: bookings.reference, state: bookings.state, reviewDueAt: bookings.reviewDueAt, travellerAge: bookings.travellerAge },
      traveller: { name: users.name, email: users.email },
      trip: { title: trips.title },
      departure: { startDate: departures.startDate },
    })
    .from(reviews)
    .innerJoin(bookings, eq(reviews.bookingId, bookings.id))
    .innerJoin(users, eq(bookings.ownerId, users.id))
    .innerJoin(departures, eq(bookings.departureId, departures.id))
    .innerJoin(trips, eq(departures.tripId, trips.id))
    .orderBy(asc(reviews.dueAt), desc(reviews.createdAt))
    .limit(200);
}

export async function listReviewActions(reviewId: string, db: DbOrTx = getDb()) {
  return db.select().from(reviewActions).where(eq(reviewActions.reviewId, reviewId)).orderBy(asc(reviewActions.createdAt));
}
