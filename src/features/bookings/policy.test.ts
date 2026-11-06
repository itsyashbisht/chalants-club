import { describe, expect, it } from "vitest";
import { computeRefundQuote, PILOT_POLICY_RULES, refundBpsFor } from "./policy";
import type { PolicyRules } from "@/features/trips/schema";

const now = new Date("2026-11-06T10:00:00+05:30");
const captures = [
  { paymentAttemptId: "dep", instalment: "deposit" as const, capturedPaise: 360_000, alreadyRefundedPaise: 0 },
  { paymentAttemptId: "bal", instalment: "balance" as const, capturedPaise: 840_000, alreadyRefundedPaise: 0 },
];

describe("refund policy", () => {
  it("refunds everything on rejection and organiser cancellation regardless of tiers", () => {
    const strict: PolicyRules = { ...PILOT_POLICY_RULES, tiers: [{ minDaysBefore: 60, refundBps: 0 }], balanceTimeoutRefundBps: 0 };
    expect(refundBpsFor(strict, "rejection", "2026-11-10", now).bps).toBe(10_000);
    expect(refundBpsFor(strict, "operator", "2026-11-10", now).bps).toBe(10_000);
    expect(refundBpsFor(strict, "departure_cancelled", "2026-11-10", now).bps).toBe(10_000);
  });

  it("applies the tier for the number of days before departure", () => {
    const tiered: PolicyRules = { ...PILOT_POLICY_RULES, tiers: [{ minDaysBefore: 30, refundBps: 10_000 }, { minDaysBefore: 7, refundBps: 5_000 }], balanceTimeoutRefundBps: 2_500 };
    expect(refundBpsFor(tiered, "traveller", "2026-12-31", now).bps).toBe(10_000);
    expect(refundBpsFor(tiered, "traveller", "2026-11-20", now).bps).toBe(5_000);
    expect(refundBpsFor(tiered, "traveller", "2026-11-08", now).bps).toBe(0);
    expect(refundBpsFor(tiered, "balance_timeout", "2026-11-08", now).bps).toBe(2_500);
  });

  it("allocates a partial refund balance-first, then deposit, never beyond what remains refundable", () => {
    const tiered: PolicyRules = { ...PILOT_POLICY_RULES, tiers: [{ minDaysBefore: 0, refundBps: 7_500 }] };
    const quote = computeRefundQuote({ rules: tiered, origin: "traveller", startDate: "2026-12-31", now, captures });
    expect(quote.capturedPaise).toBe(1_200_000);
    expect(quote.refundPaise).toBe(900_000);
    expect(quote.perPayment.map((p) => [p.instalment, p.refundPaise])).toEqual([
      ["balance", 840_000],
      ["deposit", 60_000],
    ]);
  });

  it("creates one refund per original payment on a full cancellation after both payments", () => {
    const quote = computeRefundQuote({ rules: PILOT_POLICY_RULES, origin: "traveller", startDate: "2026-12-31", now, captures });
    expect(quote.refundPaise).toBe(1_200_000);
    expect(quote.perPayment.filter((p) => p.refundPaise > 0)).toHaveLength(2);
  });

  it("respects refunds already reserved against a payment", () => {
    const quote = computeRefundQuote({
      rules: PILOT_POLICY_RULES,
      origin: "traveller",
      startDate: "2026-12-31",
      now,
      captures: [{ ...captures[0], alreadyRefundedPaise: 360_000 }, captures[1]],
    });
    expect(quote.perPayment.find((p) => p.instalment === "deposit")?.refundPaise).toBe(0);
    expect(quote.refundPaise).toBe(840_000);
  });
});
