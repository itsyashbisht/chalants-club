import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePageUser } from "@/lib/auth/pages";
import { loadBookingForViewer, toStatusView } from "@/features/bookings/status";
import { isAppError } from "@/lib/errors";
import { formatInr } from "@/lib/money";
import { formatDateRange, formatIstDateTime } from "@/lib/time";
import { Container, Section, Eyebrow } from "@/components/ui/container";
import { Notice } from "@/components/ui/notice";
import { PriceTable } from "@/components/ui/price-table";
import { CheckoutButton } from "@/features/payments/checkout-button";
import { StatusPoller } from "@/features/bookings/booking-client";

export const metadata: Metadata = { title: "Pay the balance", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BalancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requirePageUser(`/account/bookings/${id}/balance`);
  let loaded;
  try {
    loaded = await loadBookingForViewer(id, user);
  } catch (error: unknown) {
    if (isAppError(error) && error.status === 404) notFound();
    throw error;
  }
  const view = toStatusView(loaded.detail);
  const canPay = view.state === "BALANCE_DUE" && view.actions.includes("pay_balance") && !view.pendingCapture;
  return (
    <Section>
      <Container className="grid gap-10 lg:grid-cols-[7fr_5fr]">
        <div className="max-w-form">
          <StatusPoller bookingId={view.id} state={view.state} active={view.state === "BALANCE_DUE"} />
          <Eyebrow>
            <Link href={`/account/bookings/${view.id}`} className="underline">
              Booking {view.reference}
            </Link>
          </Eyebrow>
          <h1 className="text-title">Balance for {view.trip.destination}</h1>
          <p className="mt-2 text-ink-2">{formatDateRange(view.trip.startDate, view.trip.endDate)}</p>
          <div className="mt-8">
            {view.state === "BALANCE_DUE" ? (
              <>
                <p className="text-meta font-semibold uppercase tracking-wide text-ink-2">Balance due</p>
                <p className="tabular text-4xl font-bold">{formatInr(view.balancePaise)}</p>
                {view.balanceDueAt ? <p className="mt-2 text-ink-2">Pay by {formatIstDateTime(view.balanceDueAt)}. After that the seat is released and the deposit is handled under your accepted terms.</p> : null}
                <p className="mt-2 text-meta text-ink-2">Deposit of {formatInr(view.depositPaise)} already received. A payment counts only if it is captured before the deadline; anything later is refunded in full.</p>
                <div className="mt-6">
                  {canPay ? <CheckoutButton bookingId={view.id} instalment="balance" amountPaise={view.balancePaise} label={`Pay ${formatInr(view.balancePaise)} balance`} /> : <Notice tone="attention" title="Checking your payment">We’re confirming a payment with the bank. Please don’t pay again.</Notice>}
                </div>
              </>
            ) : view.state === "CONFIRMED" || view.state === "COMPLETED" ? (
              <Notice tone="success" title="Balance received">
                <p className="mt-1">
                  Your seat is confirmed. <Link href={`/account/bookings/${view.id}/circle`} className="underline">Open your circle</Link>.
                </p>
              </Notice>
            ) : view.state === "EXPIRED" || view.state === "CANCELLED" || view.state === "REJECTED" ? (
              <Notice tone="error" title="This booking is closed">
                <p className="mt-1">
                  The balance can no longer be paid. Refunds, if any, are listed on your <Link href={`/account/bookings/${view.id}`} className="underline">booking page</Link>. To travel, <Link href={`/trips/${view.trip.slug}`} className="underline">book again</Link> if seats remain, or <Link href="/contact" className="underline">contact support</Link>.
                </p>
              </Notice>
            ) : (
              <Notice tone="neutral" title="Not yet">
                <p className="mt-1">The balance opens after a reviewer approves your booking.</p>
              </Notice>
            )}
          </div>
        </div>
        <aside>
          <PriceTable totalPaise={view.totalPaise} depositPaise={view.depositPaise} balancePaise={view.balancePaise} depositPaid taxesNote={view.taxesNote} emphasis="balance" />
        </aside>
      </Container>
    </Section>
  );
}
