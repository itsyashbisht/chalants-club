import type { BookingState } from "./schema";

/** Serialisable owner-facing booking status. Built on the server; safe to send to the client. */
export type BookingStatusView = {
  id: string;
  reference: string;
  state: BookingState;
  heading: string;
  body: string;
  holdExpiresAt: string | null;
  reviewDueAt: string | null;
  balanceDueAt: string | null;
  approvedAt: string | null;
  confirmedAt: string | null;
  totalPaise: number;
  depositPaise: number;
  balancePaise: number;
  taxesNote: string;
  policySummary: string;
  trip: { slug: string; title: string; destination: string; startDate: string; endDate: string; hostName: string; meetingPointArea: string };
  instalments: Array<{ kind: "deposit" | "balance"; amountPaise: number; status: "pending" | "paid" | "void"; paidAt: string | null; dueAt: string | null }>;
  payments: Array<{ id: string; providerPaymentId: string; amountPaise: number; status: string; method: string | null; capturedAt: string | null; failedAt: string | null; applied: boolean }>;
  refunds: Array<{ id: string; amountPaise: number; state: "requested" | "processing" | "processed" | "failed"; providerRefundId: string | null; reason: string; createdAt: string; processedAt: string | null }>;
  review: { callStatus: string; decision: string; dueAt: string | null; callRequestedAt: string | null } | null;
  cancellation: { refundPaise: number; capturedPaise: number; rule: string; origin: string } | null;
  pendingCapture: boolean;
  actions: string[];
  serverTime: string;
};

export const STATE_COPY: Record<BookingState, { heading: string; body: string }> = {
  HELD: { heading: "Seat held · Deposit due", body: "Pay the deposit before the hold ends to keep this seat while we verify you." },
  UNDER_REVIEW: { heading: "Deposit received · Verification next", body: "A reviewer will confirm your identity and age on a short private call. Your seat stays held meanwhile." },
  BALANCE_DUE: { heading: "You're approved · Balance due", body: "Pay the balance before the deadline to confirm your seat." },
  CONFIRMED: { heading: "Your seat is confirmed", body: "Both instalments are received and verification is complete. Your circle is open." },
  EXPIRED: { heading: "This booking expired", body: "A payment deadline passed, so the seat was released. Any money collected is refunded under the terms you accepted." },
  REJECTED: { heading: "We couldn't confirm this booking", body: "Verification wasn't completed, so the seat was released and a full refund is on its way." },
  CANCELLED: { heading: "Booking cancelled", body: "The seat has been released. Refunds follow the terms you accepted at reservation." },
  COMPLETED: { heading: "Trip completed", body: "Thanks for travelling with us. Reconnect privately with people from your circle below." },
};

export function stateTone(state: BookingState): "success" | "attention" | "error" | "neutral" {
  if (state === "CONFIRMED" || state === "COMPLETED") return "success";
  if (state === "HELD" || state === "BALANCE_DUE" || state === "UNDER_REVIEW") return "attention";
  if (state === "REJECTED" || state === "EXPIRED") return "error";
  return "neutral";
}
