import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePageUser } from "@/lib/auth/pages";
import { loadBookingForViewer, toStatusView } from "@/features/bookings/status";
import { expireBookingIfDue } from "@/features/bookings/service";
import { stateTone } from "@/features/bookings/view";
import { isAppError } from "@/lib/errors";
import { formatInr } from "@/lib/money";
import { formatDateRange, formatIstDateTime } from "@/lib/time";
import { Container, Section, Eyebrow, Rule } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { StatusPanel } from "@/components/ui/status-panel";
import { PriceTable } from "@/components/ui/price-table";
import { CheckoutButton } from "@/features/payments/checkout-button";
import { CancelPanel, Countdown, StatusPoller } from "@/features/bookings/booking-client";

export const metadata: Metadata = { title: "Booking", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requirePageUser(`/account/bookings/${id}`);
  await expireBookingIfDue(id);
  let loaded;
  try {
    loaded = await loadBookingForViewer(id, user);
  } catch (error: unknown) {
    if (isAppError(error) && error.status === 404) notFound();
    throw error;
  }
  const view = toStatusView(loaded.detail);
  const supportEmail = process.env.SUPPORT_EMAIL || "support@example.com";
  const supportLink = (
    <>
      Need help? <Link href="/contact" className="underline">Contact support</Link> or email <a href={`mailto:${supportEmail}`} className="underline">{supportEmail}</a>. Quote {view.reference}.
    </>
  );

  const pollActive = view.pendingCapture || view.state === "HELD" || view.state === "BALANCE_DUE";
  const depositPaid = view.instalments.some((i) => i.kind === "deposit" && i.status === "paid");

  return (
    <Section>
      <Container>
        <StatusPoller bookingId={view.id} state={view.state} active={pollActive} />
        <Eyebrow>Booking {view.reference}</Eyebrow>
        <h1 className="text-title">
          {view.trip.destination}, {formatDateRange(view.trip.startDate, view.trip.endDate)}
        </h1>
        <p className="mt-2 text-ink-2">
          {view.trip.title} · hosted by {view.trip.hostName} ·{" "}
          <Link href={`/trips/${view.trip.slug}`} className="underline">
            trip page
          </Link>
        </p>

        <div className="mt-8 grid gap-10 lg:grid-cols-[7fr_5fr]">
          <div className="grid gap-8">
            <StatusPanel
              tone={view.pendingCapture ? "attention" : stateTone(view.state)}
              heading={view.heading}
              body={view.body}
              amountLabel={view.state === "HELD" ? "Deposit due now" : view.state === "BALANCE_DUE" ? "Balance due" : undefined}
              amount={view.state === "HELD" ? formatInr(view.depositPaise) : view.state === "BALANCE_DUE" ? formatInr(view.balancePaise) : undefined}
              action={
                view.state === "HELD" && view.actions.includes("pay_deposit") && !view.pendingCapture ? (
                  <CheckoutButton bookingId={view.id} instalment="deposit" amountPaise={view.depositPaise} label={`Pay ${formatInr(view.depositPaise)} deposit`} />
                ) : view.state === "UNDER_REVIEW" ? (
                  <ButtonLink href={`/account/bookings/${view.id}/verification`}>Verification instructions</ButtonLink>
                ) : view.state === "BALANCE_DUE" && view.actions.includes("pay_balance") ? (
                  <ButtonLink href={`/account/bookings/${view.id}/balance`}>Pay the balance</ButtonLink>
                ) : view.state === "CONFIRMED" || view.state === "COMPLETED" ? (
                  <ButtonLink href={`/account/bookings/${view.id}/circle`}>Open my circle</ButtonLink>
                ) : view.state === "EXPIRED" || view.state === "REJECTED" ? (
                  <ButtonLink href={`/trips/${view.trip.slug}`} variant="secondary">
                    Book again
                  </ButtonLink>
                ) : null
              }
              support={supportLink}
            >
              {view.state === "HELD" && view.holdExpiresAt ? (
                <div className="mt-4">
                  <Countdown until={view.holdExpiresAt} label="Seat held until" />
                </div>
              ) : null}
              {view.state === "UNDER_REVIEW" && view.reviewDueAt ? <p className="mt-4 text-meta text-ink-2">Review target: by {formatIstDateTime(view.reviewDueAt)}. If it takes longer, your seat stays held and the team is alerted.</p> : null}
              {view.state === "BALANCE_DUE" && view.balanceDueAt ? <p className="mt-4 text-meta text-ink-2">Pay by {formatIstDateTime(view.balanceDueAt)} to keep your seat.</p> : null}
            </StatusPanel>

            <section aria-labelledby="payments-heading">
              <h2 id="payments-heading" className="text-xl">
                Payment history
              </h2>
              {view.payments.length === 0 ? (
                <p className="mt-2 text-ink-2">No payment attempts yet.</p>
              ) : (
                <table className="mt-3 w-full text-left text-meta">
                  <thead>
                    <tr className="border-b border-rule text-ink-2">
                      <th className="py-2 pr-3 font-semibold">When</th>
                      <th className="py-2 pr-3 font-semibold">Amount</th>
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 font-semibold">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.payments.map((p) => (
                      <tr key={p.id} className="border-b border-rule">
                        <td className="py-2 pr-3">{formatIstDateTime(p.capturedAt ?? p.failedAt ?? view.serverTime)}</td>
                        <td className="tabular py-2 pr-3">{formatInr(p.amountPaise)}</td>
                        <td className="py-2 pr-3">{p.status === "captured" ? (p.applied ? "Received" : "Received · not applied, refund queued") : p.status === "failed" ? "Failed · no money taken" : p.status === "refunded" ? "Refunded" : "Checking"}</td>
                        <td className="py-2 font-mono text-xs">{p.providerPaymentId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {view.refunds.length ? (
              <section aria-labelledby="refunds-heading">
                <h2 id="refunds-heading" className="text-xl">
                  Refunds
                </h2>
                <ul className="mt-3 grid gap-3">
                  {view.refunds.map((r) => (
                    <li key={r.id} className="rounded-control border border-rule bg-surface p-4 text-meta">
                      <p className="font-semibold">
                        {r.state === "processed" ? "Refund processed" : r.state === "failed" ? "Refund needs attention" : "Refund requested"} · <span className="tabular">{formatInr(r.amountPaise)}</span>
                      </p>
                      <p className="text-ink-2">
                        {r.reason} · requested {formatIstDateTime(r.createdAt)}
                        {r.processedAt ? ` · processed ${formatIstDateTime(r.processedAt)}` : ""}
                      </p>
                      <p className="text-ink-2">Reference: <span className="font-mono text-xs">{r.providerRefundId ?? r.id}</span>. {r.state === "processed" ? "Banks usually credit within 5–7 working days." : r.state === "failed" ? "Our finance team has been alerted and will contact you." : "We’ll update this when the provider confirms."}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {view.actions.includes("cancel_quote") ? (
              <section aria-labelledby="cancel-heading">
                <Rule className="mb-6" />
                <h2 id="cancel-heading" className="text-xl">
                  Cancel this booking
                </h2>
                <p className="mt-1 text-meta text-ink-2">{view.policySummary}</p>
                <div className="mt-4">
                  <CancelPanel bookingId={view.id} />
                </div>
              </section>
            ) : null}
          </div>

          <aside className="grid gap-4 lg:sticky lg:top-6 lg:self-start">
            <PriceTable totalPaise={view.totalPaise} depositPaise={view.depositPaise} balancePaise={view.balancePaise} depositPaid={depositPaid} taxesNote={view.taxesNote} emphasis={view.state === "BALANCE_DUE" ? "balance" : view.state === "HELD" ? "deposit" : "none"} />
            <div className="rounded-control border border-rule bg-surface p-4 text-meta text-ink-2">
              <p className="font-semibold text-ink">Meeting point area</p>
              <p>{view.trip.meetingPointArea}</p>
              <p className="mt-3">
                <Link href={`/account/bookings/${view.id}/verification`} className="underline">
                  Verification
                </Link>{" "}
                ·{" "}
                <Link href={`/account/bookings/${view.id}/balance`} className="underline">
                  Balance
                </Link>{" "}
                ·{" "}
                <Link href={`/account/bookings/${view.id}/circle`} className="underline">
                  Circle
                </Link>
              </p>
            </div>
          </aside>
        </div>
      </Container>
    </Section>
  );
}
