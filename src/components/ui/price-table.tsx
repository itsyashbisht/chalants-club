import { formatInr } from "@/lib/money";

/** Checkout summary: total, due now, due later. Amounts always come from the server quote. */
export function PriceTable({ totalPaise, depositPaise, balancePaise, depositPaid = false, taxesNote, emphasis = "deposit" }: { totalPaise: number; depositPaise: number; balancePaise: number; depositPaid?: boolean; taxesNote: string; emphasis?: "deposit" | "balance" | "none" }) {
  const row = (label: string, value: string, strong = false, note?: string) => (
    <div className={`flex items-baseline justify-between gap-4 py-3 ${strong ? "text-lg font-bold" : ""}`}>
      <dt>
        {label}
        {note ? <span className="block text-meta font-normal text-ink-2">{note}</span> : null}
      </dt>
      <dd className="tabular shrink-0">{value}</dd>
    </div>
  );
  return (
    <dl className="divide-y divide-rule rounded-control border border-rule bg-surface px-5">
      {row("Total per person", formatInr(totalPaise), false, taxesNote)}
      {row(depositPaid ? "Deposit paid" : "Deposit due today", formatInr(depositPaise), emphasis === "deposit", depositPaid ? "Received" : "Holds your seat for verification")}
      {row("Balance after approval", formatInr(balancePaise), emphasis === "balance", "Due within the window shown on your booking")}
    </dl>
  );
}
