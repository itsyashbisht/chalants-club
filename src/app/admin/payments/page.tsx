import type { Metadata } from "next";
import Link from "next/link";
import { requirePageRole } from "@/lib/auth/pages";
import { ledgerSummary } from "@/features/payments/reconcile";
import { listInboxProblems, listOldPendingOrders, listQuarantined, listRefundsNeedingAttention, searchPayments } from "@/features/payments/admin-queries";
import { schedulerHealth } from "@/lib/jobs/tick";
import { paymentsConfig } from "@/lib/env";
import { formatInr } from "@/lib/money";
import { formatIstDateTime } from "@/lib/time";
import { Notice } from "@/components/ui/notice";
import { Input, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ReconcileButton } from "./reconcile-button";

export const metadata: Metadata = { title: "Payments (admin)", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { allowed } = await requirePageRole("/admin/payments", "finance", "operator");
  if (!allowed) return <Notice tone="error" title="Finance role required" />;
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const [ledger, refundsRows, quarantined, inbox, oldOrders, health, search] = await Promise.all([
    ledgerSummary(),
    listRefundsNeedingAttention(),
    listQuarantined(),
    listInboxProblems(),
    listOldPendingOrders(),
    schedulerHealth(),
    q ? searchPayments(q) : Promise.resolve(null),
  ]);
  const cfg = paymentsConfig();
  return (
    <>
      <h1 className="text-title">Payments</h1>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Notice tone={cfg.ok ? (cfg.mode === "test" ? "attention" : "success") : "error"} title={cfg.ok ? `Razorpay ${cfg.mode} mode` : `Razorpay not configured (${cfg.reason})`}>
          {cfg.ok && cfg.mode === "test" ? "Test mode: no real money moves." : null}
          {cfg.ok && !cfg.webhookSecret ? " Webhook secret missing: events will be rejected." : null}
        </Notice>
        <Notice tone={health.stale ? "error" : "success"} title={health.stale ? "Scheduler stale" : "Scheduler healthy"}>
          Last tick: {health.lastRunAt ? formatIstDateTime(health.lastRunAt) : "never"}. Expected every minute.
        </Notice>
      </div>

      <form method="get" className="mt-6 flex max-w-form items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="q">Search booking, order, payment or refund reference</Label>
          <Input id="q" name="q" defaultValue={q} placeholder="TC-… / order_… / pay_… / rfnd_…" />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {search ? (
        <div className="mt-4 rounded-control border border-rule bg-surface p-4 text-meta">
          {search.bookings.length === 0 && search.orphanPayments.length === 0 && search.orphanRefunds.length === 0 ? <p>No matches.</p> : null}
          <ul>
            {search.bookings.map((b) => (
              <li key={b.id} className="py-1">
                <Link href={`/admin/bookings/${b.id}`} className="font-semibold underline">
                  {b.reference}
                </Link>{" "}
                · {b.state} · {formatInr(b.totalPaise)} · {b.email}
              </li>
            ))}
            {search.orphanPayments.map((p) => (
              <li key={p.id} className="py-1">
                Orphan payment {p.providerPaymentId} · {p.status} · {formatInr(p.amountPaise)} <ReconcileButton kind="payment" id={p.id} />
              </li>
            ))}
            {search.orphanRefunds.map((r) => (
              <li key={r.id} className="py-1">
                Orphan refund {r.providerRefundId ?? r.id} · {r.state} · {formatInr(r.amountPaise)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h2 className="mt-10 text-xl">Ledger</h2>
      <dl className="mt-3 grid gap-4 text-meta md:grid-cols-4">
        <div className="rounded-control border border-rule bg-surface p-4">
          <dt className="text-ink-2">Captured</dt>
          <dd className="tabular text-xl font-bold">{formatInr(ledger.captured.paise)}</dd>
          <dd className="text-ink-2">{ledger.captured.count} payments</dd>
        </div>
        <div className="rounded-control border border-rule bg-surface p-4">
          <dt className="text-ink-2">Applied to bookings</dt>
          <dd className="tabular text-xl font-bold">{formatInr(ledger.applied.paise)}</dd>
          <dd className="text-ink-2">{ledger.applied.count} allocations</dd>
        </div>
        <div className="rounded-control border border-rule bg-surface p-4">
          <dt className="text-ink-2">Awaiting reconciliation</dt>
          <dd className="tabular text-xl font-bold">{formatInr(ledger.unapplied.paise)}</dd>
          <dd className="text-ink-2">{ledger.unapplied.count} unapplied captures · {ledger.oldPendingOrders} old pending orders</dd>
        </div>
        <div className="rounded-control border border-rule bg-surface p-4">
          <dt className="text-ink-2">Refunds</dt>
          <dd className="text-ink-2">
            {ledger.refunds.map((r) => (
              <span key={r.state} className="block">
                {r.state}: {r.count} · <span className="tabular">{formatInr(r.paise)}</span>
              </span>
            ))}
            {ledger.refunds.length === 0 ? "none" : null}
          </dd>
          <dd className="text-ink-2">Oldest pending: {ledger.oldestPendingRefundAt ? formatIstDateTime(ledger.oldestPendingRefundAt) : "—"}</dd>
        </div>
      </dl>
      <p className="mt-2 text-meta text-ink-2">
        Inbox backlog {ledger.inboxBacklog} · inbox failed {ledger.inboxFailed} · outbox pending {ledger.outboxBacklog} · late captures (7d) {ledger.lateCapturesLast7Days}. Compare captured and refund totals with the Razorpay dashboard daily; dashboard-initiated refunds are recorded with origin “provider”.
      </p>

      <h2 className="mt-10 text-xl">Refunds needing attention ({refundsRows.length})</h2>
      <ul className="mt-3 grid gap-2 text-meta">
        {refundsRows.map(({ refund, payment, booking }) => (
          <li key={refund.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-rule bg-surface p-3">
            <span>
              {refund.state} · {formatInr(refund.amountPaise)} of {formatInr(payment.amountPaise)} on <span className="font-mono text-xs">{payment.providerPaymentId}</span> · {booking?.reference ?? "no booking"} · attempts {refund.attempts}
              {refund.lastError ? ` · ${refund.lastError}` : ""}
            </span>
            {refund.origin !== "provider" ? <ReconcileButton kind="refund" id={refund.id} label="Retry" /> : null}
          </li>
        ))}
        {refundsRows.length === 0 ? <li className="text-ink-2">None.</li> : null}
      </ul>

      <h2 className="mt-10 text-xl">Quarantined and unapplied captures ({quarantined.length})</h2>
      <ul className="mt-3 grid gap-2 text-meta">
        {quarantined.map(({ allocation, payment, booking }) => (
          <li key={allocation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-rule bg-surface p-3">
            <span>
              {allocation.outcome} · {formatInr(allocation.amountPaise)} · <span className="font-mono text-xs">{payment.providerPaymentId}</span> · {booking?.reference ?? "unmapped"} · {allocation.note ?? ""}
            </span>
            <ReconcileButton kind="payment" id={payment.id} />
          </li>
        ))}
        {quarantined.length === 0 ? <li className="text-ink-2">None.</li> : null}
      </ul>

      <h2 className="mt-10 text-xl">Old pending orders ({oldOrders.length})</h2>
      <ul className="mt-3 grid gap-2 text-meta">
        {oldOrders.map(({ order, booking }) => (
          <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-rule bg-surface p-3">
            <span>
              {order.requestState} · {formatInr(order.amountPaise)} · <span className="font-mono text-xs">{order.providerOrderId ?? order.receipt}</span> · {booking.reference} ({booking.state}) · {formatIstDateTime(order.createdAt)}
            </span>
            <ReconcileButton kind="order" id={order.id} />
          </li>
        ))}
        {oldOrders.length === 0 ? <li className="text-ink-2">None.</li> : null}
      </ul>

      <h2 className="mt-10 text-xl">Webhook inbox problems ({inbox.length})</h2>
      <ul className="mt-3 grid gap-2 text-meta">
        {inbox.map((i) => (
          <li key={i.id} className="rounded-control border border-rule bg-surface p-3">
            {i.status} · {i.eventType} · {i.eventId} · attempts {i.attempts} · {i.lastError ?? ""} · {formatIstDateTime(i.receivedAt)}
          </li>
        ))}
        {inbox.length === 0 ? <li className="text-ink-2">None.</li> : null}
      </ul>
      <p className="mt-6 text-meta text-ink-2">Replay path: failed inbox items are retried by the scheduler with backoff; after eight attempts they are marked failed and alerted. To replay manually, reconcile the payment or order above, which re-fetches canonical provider state.</p>
    </>
  );
}
