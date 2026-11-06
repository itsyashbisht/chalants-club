import "@/lib/server-guard";
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { users } from "@/lib/db/core-schema";
import { env } from "@/lib/env";
import type { EmailMessage } from "@/lib/email";
import { formatInr } from "@/lib/money";
import { formatDateRange, formatIstDateTime } from "@/lib/time";
import { refunds } from "@/features/payments/schema";
import type { OutboxKind } from "@/features/payments/schema";
import { loadBookingDetail } from "./service";

/**
 * Builds the customer email for a booking transition. Only the necessary amount, deadline, reference and an
 * authenticated booking link are included; no quiz answers, notes or provider payloads.
 */
export async function buildBookingEmail(kind: OutboxKind, payload: Record<string, unknown>, db: DbOrTx): Promise<EmailMessage | null> {
  const bookingId = typeof payload.bookingId === "string" ? payload.bookingId : null;
  if (!bookingId) return null;
  const detail = await loadBookingDetail(bookingId, db);
  if (!detail) return null;
  const [owner] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, detail.booking.ownerId)).limit(1);
  if (!owner) return null;
  const e = env();
  const link = `${e.APP_URL}/account/bookings/${detail.booking.id}`;
  const greeting = owner.name ? `Hi ${owner.name.split(" ")[0]},` : "Hi,";
  const trip = `${detail.trip.title} (${formatDateRange(detail.departure.startDate, detail.departure.endDate)})`;
  const ref = detail.booking.reference;
  const footer = `\n\nYour booking: ${link}\nSupport: ${e.SUPPORT_EMAIL} (${e.SUPPORT_HOURS})\n${e.OPERATOR_NAME}`;
  const to = owner.email;

  switch (kind) {
    case "email.deposit_receipt":
      return {
        to,
        idempotencyKey: `email.deposit_receipt:${bookingId}`,
        subject: `Deposit received · ${ref}`,
        text: `${greeting}\n\nWe received your deposit of ${formatInr(detail.booking.depositPaise)} for ${trip}. Your seat is held while a reviewer completes a short private verification call.${
          detail.booking.reviewDueAt ? `\n\nReview target: by ${formatIstDateTime(detail.booking.reviewDueAt)}.` : ""
        }\n\nNext step: request a review slot from your booking page.${footer}`,
      };
    case "email.approved":
      return {
        to,
        idempotencyKey: `email.approved:${bookingId}`,
        subject: `You're approved · pay the balance by ${detail.booking.balanceDueAt ? formatIstDateTime(detail.booking.balanceDueAt) : "the deadline"}`,
        text: `${greeting}\n\nVerification is complete for ${trip}. Pay the balance of ${formatInr(detail.booking.balancePaise)}${
          detail.booking.balanceDueAt ? ` by ${formatIstDateTime(detail.booking.balanceDueAt)}` : ""
        } to confirm your seat. If the balance is not received in time, the seat is released under the terms you accepted.${footer}`,
      };
    case "email.info_requested":
      return {
        to,
        idempotencyKey: `email.info_requested:${bookingId}:${detail.review?.revision ?? 0}`,
        subject: `A reviewer needs a little more from you · ${ref}`,
        text: `${greeting}\n\nYour reviewer could not complete verification yet for ${trip}. Please open your booking to rebook a private review call or reply to support. Your seat stays held while this is resolved.${footer}`,
      };
    case "email.rejected":
      return {
        to,
        idempotencyKey: `email.rejected:${bookingId}`,
        subject: `We can't confirm this booking · ${ref}`,
        text: `${greeting}\n\nWe were unable to complete verification for ${trip}, so the seat has been released. A full refund of ${formatInr(detail.cancellation?.refundPaise ?? detail.booking.depositPaise)} has been requested to your original payment method. You can track the refund on your booking page.${footer}`,
      };
    case "email.confirmed":
      return {
        to,
        idempotencyKey: `email.confirmed:${bookingId}`,
        subject: `Your seat is confirmed · ${trip}`,
        text: `${greeting}\n\nYou're in. Both instalments for ${trip} are received and your seat is confirmed. Your host is ${detail.host.name}. Meeting point area: ${detail.trip.meetingPointArea}.\n\nOpen your circle for logistics, the playlist and what to expect on arrival.${footer}`,
      };
    case "email.hold_expired":
      return {
        to,
        idempotencyKey: `email.hold_expired:${bookingId}`,
        subject: `Your seat hold expired · ${ref}`,
        text: `${greeting}\n\nThe 15-minute hold for ${trip} ended before a deposit was received. No money was taken. If seats are still available you can book again from the trip page.${footer}`,
      };
    case "email.balance_expired":
      return {
        to,
        idempotencyKey: `email.balance_expired:${bookingId}`,
        subject: `Balance window closed · ${ref}`,
        text: `${greeting}\n\nThe balance for ${trip} was not received before the deadline, so the seat has been released under the terms you accepted. ${
          detail.cancellation && detail.cancellation.refundPaise > 0 ? `A refund of ${formatInr(detail.cancellation.refundPaise)} has been requested to your original payment.` : ""
        }${footer}`,
      };
    case "email.cancelled":
      return {
        to,
        idempotencyKey: `email.cancelled:${bookingId}`,
        subject: `Booking cancelled · ${ref}`,
        text: `${greeting}\n\nYour booking for ${trip} is cancelled. ${
          detail.cancellation ? `Refund under the accepted terms: ${formatInr(detail.cancellation.refundPaise)} of ${formatInr(detail.cancellation.capturedPaise)} collected. ${detail.cancellation.breakdown.rule}` : ""
        }\n\nRefunds go back to the original payment method. Bank credit timing depends on your bank.${footer}`,
      };
    case "email.refund_update": {
      const refundId = typeof payload.refundId === "string" ? payload.refundId : null;
      const refund = refundId ? (await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1))[0] : null;
      const state = refund?.state ?? "requested";
      const heading = state === "processed" ? "Refund processed" : state === "failed" ? "Refund needs attention" : "Refund requested";
      return {
        to,
        idempotencyKey: `email.refund_update:${refundId ?? String(payload.paymentAttemptId ?? bookingId)}:${state}`,
        subject: `${heading} · ${ref}`,
        text: `${greeting}\n\n${heading}${refund ? ` for ${formatInr(refund.amountPaise)}` : ""} on ${trip}.${
          state === "processed"
            ? ` Reference: ${refund?.providerRefundId ?? refund?.id}. Your bank usually credits within 5–7 working days.`
            : state === "failed"
              ? " Our finance team has been alerted and will contact you. Nothing further is needed from you right now."
              : " We'll email you again when it is processed."
        }${footer}`,
      };
    }
    default:
      return null;
  }
}
