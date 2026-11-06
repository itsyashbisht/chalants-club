import { shareByBps } from "@/lib/money";
import type { PolicyRules } from "@/features/trips/schema";
import type { CancellationOrigin, RefundBreakdown } from "./schema";

export type CapturedPayment = {
  paymentAttemptId: string;
  instalment: "deposit" | "balance";
  capturedPaise: number;
  /** Non-failed refunds already reserved or processed against this payment. */
  alreadyRefundedPaise: number;
};

const DAY_MS = 86_400_000;

export function daysBefore(startDate: string | Date, now: Date): number {
  const start = typeof startDate === "string" ? new Date(`${startDate}T00:00:00+05:30`) : startDate;
  return Math.floor((start.getTime() - now.getTime()) / DAY_MS);
}

/** Refund share for an origin under the frozen rules. Rejection and operator cancellation always refund in full. */
export function refundBpsFor(rules: PolicyRules, origin: CancellationOrigin, startDate: string, now: Date): { bps: number; rule: string } {
  switch (origin) {
    case "rejection":
      return { bps: 10_000, rule: "Verification not completed: full refund of money collected." };
    case "operator":
    case "departure_cancelled":
      return { bps: 10_000, rule: "Cancelled by the organiser: full refund of all captured instalments." };
    case "balance_timeout":
      return { bps: rules.balanceTimeoutRefundBps, rule: `Balance window lapsed: ${rules.balanceTimeoutRefundBps / 100}% of money collected refunded.` };
    case "traveller": {
      const days = daysBefore(startDate, now);
      const tiers = [...rules.tiers].sort((a, b) => b.minDaysBefore - a.minDaysBefore);
      const tier = tiers.find((t) => days >= t.minDaysBefore);
      if (!tier) return { bps: 0, rule: `Cancelled ${days} day(s) before departure: no refund under the accepted terms.` };
      return { bps: tier.refundBps, rule: `Cancelled ${days} day(s) before departure: ${tier.refundBps / 100}% of money collected refunded.` };
    }
  }
}

/**
 * Computes the refund quote against actual captured funds, allocated balance-first then deposit,
 * never exceeding what remains refundable on each original payment.
 */
export function computeRefundQuote(input: {
  rules: PolicyRules;
  origin: CancellationOrigin;
  startDate: string;
  now: Date;
  captures: CapturedPayment[];
}): RefundBreakdown {
  const capturedPaise = input.captures.reduce((sum, c) => sum + c.capturedPaise, 0);
  const { bps, rule } = refundBpsFor(input.rules, input.origin, input.startDate, input.now);
  let remaining = shareByBps(capturedPaise, bps);
  const ordered = [...input.captures].sort((a, b) => (a.instalment === b.instalment ? 0 : a.instalment === "balance" ? -1 : 1));
  const perPayment = ordered.map((c) => {
    const refundable = Math.max(0, c.capturedPaise - c.alreadyRefundedPaise);
    const amount = Math.min(remaining, refundable);
    remaining -= amount;
    return { paymentAttemptId: c.paymentAttemptId, instalment: c.instalment, capturedPaise: c.capturedPaise, refundPaise: amount };
  });
  const refundPaise = perPayment.reduce((sum, p) => sum + p.refundPaise, 0);
  return { capturedPaise, refundBps: bps, refundPaise, rule, perPayment };
}

export const PILOT_POLICY_RULES: PolicyRules = {
  kind: "tiered",
  tiers: [{ minDaysBefore: 0, refundBps: 10_000 }],
  balanceTimeoutRefundBps: 10_000,
  rounding: "nearest",
  summary:
    "Pilot fixture: cancel any time before departure for a full refund of money collected. If the balance is not paid within the window after approval, the seat is released and the deposit is refunded in full. Replace with the operator's published terms before launch.",
  examples: [
    "Deposit ₹3,600 paid, you cancel 20 days before departure: ₹3,600 refunded to the original payment.",
    "Deposit ₹3,600 and balance ₹8,400 paid, you cancel 5 days before departure: ₹8,400 refunded to the balance payment and ₹3,600 to the deposit payment.",
    "Approved but balance not paid in time: seat released, ₹3,600 deposit refunded.",
  ],
};
