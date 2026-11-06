import { describe, expect, it } from "vitest";
import { depositFromTotal, formatInr, shareByBps, splitInstalments } from "./money";

describe("money", () => {
  it("splits the documented example: 1,200,000 paise at 3,000 bps", () => {
    expect(splitInstalments(1_200_000, 3_000)).toEqual({ depositPaise: 360_000, balancePaise: 840_000 });
  });

  it("rounds the deposit to the nearest paisa and keeps the sum exact", () => {
    const total = 1_000_001;
    const { depositPaise, balancePaise } = splitInstalments(total, 3_333);
    expect(depositPaise).toBe(Math.round((total * 3_333) / 10_000));
    expect(depositPaise + balancePaise).toBe(total);
  });

  it("rejects non-integer or non-positive instalments", () => {
    expect(() => depositFromTotal(100.5, 3000)).toThrow();
    expect(() => depositFromTotal(1, 1)).not.toThrow();
    expect(() => splitInstalments(1, 1)).toThrow(/positive/);
    expect(() => depositFromTotal(1000, 10_000)).toThrow();
  });

  it("formats rupees with Indian grouping and hides zero paise", () => {
    expect(formatInr(1_200_000)).toBe("₹12,000");
    expect(formatInr(1_200_050)).toBe("₹12,000.50");
    expect(formatInr(123_456_789_00)).toBe("₹12,34,56,789");
  });

  it("computes shares by basis points", () => {
    expect(shareByBps(1_200_000, 10_000)).toBe(1_200_000);
    expect(shareByBps(1_200_000, 5_000)).toBe(600_000);
    expect(shareByBps(1, 5_000)).toBe(1);
  });
});
