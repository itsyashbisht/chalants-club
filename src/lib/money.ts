/** Money helpers. All amounts are integer paise, INR only. Safe for client and server. */

export const CURRENCY = "INR" as const;

export function assertPaise(value: number, label = "amount"): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer number of paise`);
  }
  return value;
}

/** Deposit in paise using nearest-integer rounding of total × basis points / 10 000. */
export function depositFromTotal(totalPaise: number, depositBps: number): number {
  assertPaise(totalPaise, "total");
  if (!Number.isInteger(depositBps) || depositBps <= 0 || depositBps >= 10_000) {
    throw new Error("deposit basis points must be an integer between 1 and 9999");
  }
  return Math.round((totalPaise * depositBps) / 10_000);
}

export function splitInstalments(totalPaise: number, depositBps: number): { depositPaise: number; balancePaise: number } {
  const depositPaise = depositFromTotal(totalPaise, depositBps);
  const balancePaise = totalPaise - depositPaise;
  if (depositPaise <= 0 || balancePaise <= 0) {
    throw new Error("Both instalments must be positive");
  }
  return { depositPaise, balancePaise };
}

/** Share of an amount by basis points, nearest-integer rounding. */
export function shareByBps(amountPaise: number, bps: number): number {
  assertPaise(amountPaise);
  return Math.round((amountPaise * bps) / 10_000);
}

const wholeRupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});
const rupeesWithPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

/** Formats paise as rupees: ₹12,000 or ₹12,000.50. */
export function formatInr(paise: number): string {
  const rupees = paise / 100;
  return paise % 100 === 0 ? wholeRupees.format(rupees) : rupeesWithPaise.format(rupees);
}
