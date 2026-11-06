import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requirePageRole } from "@/lib/auth/pages";
import { hasRole } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/core-schema";
import { loadBookingDetail } from "@/features/bookings/service";
import { ACTIVE_BOOKING_STATES } from "@/features/bookings/schema";
import { listReviewActions } from "@/features/verification/service";
import { listSupportCasesForBooking } from "@/features/support/service";
import { formatInr } from "@/lib/money";
import { formatDateRange, formatIstDateTime } from "@/lib/time";
import { Notice } from "@/components/ui/notice";
import { Rule } from "@/components/ui/container";
import { CallStatusButtons, DecisionForm, OperatorCancel } from "./admin-booking-client";
import { ReconcileButton } from "@/app/admin/payments/reconcile-button";

export const metadata: Metadata = { title: "Booking (admin)", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { user, allowed } = await requirePageRole(`/admin/bookings/${id}`, "reviewer", "finance", "operator");
  if (!allowed) return <Notice tone="error" title="Staff role required" />;
  const detail = await loadBookingDetail(id);
  if (!detail) notFound();
  const [owner] = await getDb().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, detail.booking.ownerId)).limit(1);
  const [actions, cases] = await Promise.all([detail.review ? listReviewActions(detail.review.id) : Promise.resolve([]), listSupportCasesForBooking(id)]);
  const isReviewer = hasRole(user, "reviewer", "operator");
  const isFinance = hasRole(user, "finance", "operator");
  const isOperator = hasRole(user, "operator");
  const b = detail.booking;
  return (
    <>
      <p className="text-meta font-semibold uppercase tracking-wide text-ink-2">Booking</p>
      <h1 className="text-title">
        {b.reference} · {b.state}
      </h1>
      <p className="mt-2 text-ink-2">
        {detail.trip.title} · {formatDateRange(detail.departure.startDate, detail.departure.endDate)} ·{" "}
        <Link href={`/admin/departures/${detail.departure.id}`} className="underline">
          departure
        </Link>
      </p>
      <dl className="mt-6 grid gap-4 text-meta md:grid-cols-4">
        <div>
          <dt className="font-semibold">Traveller</dt>
          <dd className="text-ink-2">
            {owner?.name ?? "—"} · age {b.travellerAge}
            <br />
            {isReviewer || isOperator ? owner?.email : "(email restricted)"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Quote</dt>
          <dd className="tabular text-ink-2">
            {formatInr(b.totalPaise)} · deposit {formatInr(b.depositPaise)} · balance {formatInr(b.balancePaise)}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Deadlines (IST)</dt>
          <dd className="text-ink-2">
            {b.holdExpiresAt ? `Hold ${formatIstDateTime(b.holdExpiresAt)}` : null}
            {b.reviewDueAt ? `Review ${formatIstDateTime(b.reviewDueAt)}` : null}
            {b.balanceDueAt ? `Balance ${formatIstDateTime(b.balanceDueAt)}` : null}
            {!b.holdExpiresAt && !b.reviewDueAt && !b.balanceDueAt ? "—" : null}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Accepted</dt>
          <dd className="text-ink-2">
            Policy v{b.quoteVersion} · {formatIstDateTime(b.policyAcceptedAt)}
          </dd>
        </div>
      </dl>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        {isReviewer ? (
          <section className="rounded-editorial border border-rule bg-surface p-6">
            <h2 className="text-xl">Verification</h2>
            {detail.review ? (
              <>
                <p className="mt-2 text-meta text-ink-2">
                  Call: {detail.review.callStatus} · decision: {detail.review.decision} · revision {detail.review.revision}
                  {detail.review.escalatedAt ? " · escalated" : ""}
                </p>
                {detail.review.callRequestNote ? (
                  <div className="mt-3">
                    <Notice tone="neutral" title="Traveller's scheduling request (restricted)">
                      <p className="mt-1 whitespace-pre-line">{detail.review.callRequestNote}</p>
                      {detail.review.callRequestedAt ? <p className="mt-1 text-meta text-ink-2">Requested {formatIstDateTime(detail.review.callRequestedAt)}</p> : null}
                    </Notice>
                  </div>
                ) : null}
                <div className="mt-4 rounded-control bg-tint p-4 text-meta">
                  <p className="font-semibold">Private call instructions</p>
                  <ol className="mt-1 list-decimal pl-5 text-ink-2">
                    <li>Confirm the slot by email from the staffed inbox; use video.</li>
                    <li>Ask the traveller to show an accepted government photo ID live. Match face, name and date of birth to the booking age.</li>
                    <li>Do not screenshot, download or note document numbers. Record the outcome below.</li>
                  </ol>
                </div>
                {b.state === "UNDER_REVIEW" ? (
                  <div className="mt-4">
                    <CallStatusButtons reviewId={detail.review.id} />
                  </div>
                ) : null}
                <div className="mt-6">
                  <DecisionForm reviewId={detail.review.id} revision={detail.review.revision} bookingState={b.state} />
                </div>
                <h3 className="mt-6 font-semibold">Audit</h3>
                <ul className="mt-2 text-meta text-ink-2">
                  {actions.map((a) => (
                    <li key={a.id}>
                      {formatIstDateTime(a.createdAt)} · {a.action}
                      {a.reasonCode ? ` (${a.reasonCode})` : ""}
                      {a.note ? ` · ${a.note}` : ""}
                    </li>
                  ))}
                  {actions.length === 0 ? <li>No actions yet.</li> : null}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-ink-2">No review yet; it starts once the deposit is captured.</p>
            )}
          </section>
        ) : null}

        <section className="grid gap-6">
          {isFinance ? (
            <div className="rounded-editorial border border-rule bg-surface p-6">
              <h2 className="text-xl">Money</h2>
              <h3 className="mt-3 font-semibold">Orders</h3>
              <ul className="mt-1 text-meta text-ink-2">
                {detail.orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                    <span>
                      {o.requestState} · {formatInr(o.amountPaise)} · <span className="font-mono text-xs">{o.providerOrderId ?? o.receipt}</span>
                    </span>
                    {o.requestState === "created" || o.requestState === "uncertain" ? <ReconcileButton kind="order" id={o.id} /> : null}
                  </li>
                ))}
                {detail.orders.length === 0 ? <li>None.</li> : null}
              </ul>
              <h3 className="mt-3 font-semibold">Payments</h3>
              <ul className="mt-1 text-meta text-ink-2">
                {detail.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                    <span>
                      {p.status} · {formatInr(p.amountPaise)} · <span className="font-mono text-xs">{p.providerPaymentId}</span> · {detail.allocations.find((a) => a.paymentAttemptId === p.id)?.outcome ?? "unallocated"}
                    </span>
                    <ReconcileButton kind="payment" id={p.id} />
                  </li>
                ))}
                {detail.payments.length === 0 ? <li>None.</li> : null}
              </ul>
              <h3 className="mt-3 font-semibold">Refunds</h3>
              <ul className="mt-1 text-meta text-ink-2">
                {detail.refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                    <span>
                      {r.state} · {formatInr(r.amountPaise)} · {r.origin} · <span className="font-mono text-xs">{r.providerRefundId ?? r.id}</span> · attempts {r.attempts}
                      {r.lastError ? ` · ${r.lastError}` : ""}
                    </span>
                    {r.state !== "processed" && r.origin !== "provider" ? <ReconcileButton kind="refund" id={r.id} label="Retry" /> : null}
                  </li>
                ))}
                {detail.refunds.length === 0 ? <li>None.</li> : null}
              </ul>
              {detail.cancellation ? (
                <p className="mt-3 text-meta text-ink-2">
                  Cancellation ({detail.cancellation.origin}): {formatInr(detail.cancellation.refundPaise)} of {formatInr(detail.cancellation.capturedPaise)} · {detail.cancellation.breakdown.rule}
                </p>
              ) : null}
            </div>
          ) : null}

          {isOperator ? (
            <div className="rounded-editorial border border-rule bg-surface p-6">
              <h2 className="text-xl">Operator</h2>
              <div className="mt-3">
                <OperatorCancel bookingId={b.id} active={ACTIVE_BOOKING_STATES.includes(b.state)} />
                {!ACTIVE_BOOKING_STATES.includes(b.state) ? <p className="text-meta text-ink-2">Booking is closed.</p> : null}
              </div>
            </div>
          ) : null}

          <div className="rounded-editorial border border-rule bg-surface p-6">
            <h2 className="text-xl">Support timeline</h2>
            <ul className="mt-2 text-meta text-ink-2">
              {cases.map((c) => (
                <li key={c.id} className="py-1">
                  {formatIstDateTime(c.createdAt)} · {c.category} · {c.subject} ({c.status})
                </li>
              ))}
              {cases.length === 0 ? <li>No support cases.</li> : null}
            </ul>
          </div>
        </section>
      </div>
      <Rule className="my-8" />
      <p className="text-meta text-ink-2">Quiz answers, intent and raw provider payloads are not shown here by design.</p>
    </>
  );
}
