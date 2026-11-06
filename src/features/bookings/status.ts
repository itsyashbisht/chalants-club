import "@/lib/server-guard";
import { allowedActions, loadBookingDetail, type BookingDetail } from "./service";
import { STATE_COPY, type BookingStatusView } from "./view";
import { errors } from "@/lib/errors";
import type { CurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/server";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toStatusView(detail: NonNullable<BookingDetail>, now = new Date()): BookingStatusView {
  const b = detail.booking;
  const copy = STATE_COPY[b.state];
  const appliedPaymentIds = new Set(detail.allocations.filter((a) => a.outcome === "applied").map((a) => a.paymentAttemptId));
  const pendingCapture =
    detail.payments.some((p) => p.status === "authorized" || p.status === "created") ||
    (b.state === "HELD" && detail.orders.some((o) => o.requestState === "created" || o.requestState === "uncertain"));
  return {
    id: b.id,
    reference: b.reference,
    state: b.state,
    heading: pendingCapture && (b.state === "HELD" || b.state === "BALANCE_DUE") ? "Checking your payment" : copy.heading,
    body: pendingCapture && (b.state === "HELD" || b.state === "BALANCE_DUE") ? "We're confirming your payment with the bank. This page updates automatically; do not pay again." : copy.body,
    holdExpiresAt: iso(b.holdExpiresAt),
    reviewDueAt: iso(b.reviewDueAt),
    balanceDueAt: iso(b.balanceDueAt),
    approvedAt: iso(b.approvedAt),
    confirmedAt: iso(b.confirmedAt),
    totalPaise: b.totalPaise,
    depositPaise: b.depositPaise,
    balancePaise: b.balancePaise,
    taxesNote: b.taxesNote,
    policySummary: b.policyRules.summary,
    trip: {
      slug: detail.trip.slug,
      title: detail.trip.title,
      destination: detail.trip.destination,
      startDate: detail.departure.startDate,
      endDate: detail.departure.endDate,
      hostName: detail.host.name,
      meetingPointArea: detail.trip.meetingPointArea,
    },
    instalments: detail.instalments.map((i) => ({ kind: i.kind, amountPaise: i.amountPaise, status: i.status, paidAt: iso(i.paidAt), dueAt: iso(i.dueAt) })),
    payments: detail.payments.map((p) => ({
      id: p.id,
      providerPaymentId: p.providerPaymentId,
      amountPaise: p.amountPaise,
      status: p.status,
      method: p.method,
      capturedAt: iso(p.capturedAt),
      failedAt: iso(p.failedAt),
      applied: appliedPaymentIds.has(p.id),
    })),
    refunds: detail.refunds.map((r) => ({ id: r.id, amountPaise: r.amountPaise, state: r.state, providerRefundId: r.providerRefundId, reason: r.reason, createdAt: r.createdAt.toISOString(), processedAt: iso(r.processedAt) })),
    review: detail.review ? { callStatus: detail.review.callStatus, decision: detail.review.decision, dueAt: iso(detail.review.dueAt), callRequestedAt: iso(detail.review.callRequestedAt) } : null,
    cancellation: detail.cancellation ? { refundPaise: detail.cancellation.refundPaise, capturedPaise: detail.cancellation.capturedPaise, rule: detail.cancellation.breakdown.rule, origin: detail.cancellation.origin } : null,
    pendingCapture,
    actions: allowedActions(detail, now),
    serverTime: now.toISOString(),
  };
}

/** Loads a booking for its owner, or for staff with a reviewing/finance/operator role. Foreign bookings are 404. */
export async function loadBookingForViewer(bookingId: string, user: CurrentUser) {
  const detail = await loadBookingDetail(bookingId);
  if (!detail) throw errors.notFound("Booking not found.");
  const staff = hasRole(user, "reviewer", "finance", "operator");
  if (detail.booking.ownerId !== user.id && !staff) throw errors.notFound("Booking not found.");
  return { detail, isOwner: detail.booking.ownerId === user.id, isStaff: staff };
}
