import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requirePageUser } from "@/lib/auth/pages";
import { getDepartureDetail } from "@/features/trips/queries";
import { listBookingsForOwner } from "@/features/bookings/service";
import { ACTIVE_BOOKING_STATES } from "@/features/bookings/schema";
import { splitInstalments } from "@/lib/money";
import { formatDateRange, nowMs } from "@/lib/time";
import { Container, Section, Eyebrow } from "@/components/ui/container";
import { PriceTable } from "@/components/ui/price-table";
import { Notice } from "@/components/ui/notice";
import { BookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Reserve a seat", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BookPage({ params }: { params: Promise<{ departureId: string }> }) {
  const { departureId } = await params;
  if (!z.string().uuid().safeParse(departureId).success) notFound();
  const user = await requirePageUser(`/book/${departureId}`);
  const departure = await getDepartureDetail(departureId);
  if (!departure) notFound();

  const existing = (await listBookingsForOwner(user.id)).find((b) => b.booking.departureId === departureId && ACTIVE_BOOKING_STATES.includes(b.booking.state));
  if (existing) redirect(`/account/bookings/${existing.booking.id}`);

  const quote = splitInstalments(departure.totalPaise, departure.depositBps);
  const open = departure.status === "published" && departure.salesCloseAt.getTime() > nowMs();
  const full = departure.seatsLeft <= 0;

  return (
    <Section>
      <Container className="grid gap-10 lg:grid-cols-[7fr_5fr]">
        <div className="max-w-form">
          <Eyebrow>Reserve a seat</Eyebrow>
          <h1 className="text-title">
            {departure.trip.destination}, {formatDateRange(departure.startDate, departure.endDate)}
          </h1>
          <p className="mt-2 text-ink-2">
            {departure.trip.title} · hosted by {departure.host.name} ·{" "}
            <Link href={`/trips/${departure.trip.slug}?departure=${departure.id}`} className="underline">
              trip details
            </Link>
          </p>
          <div className="mt-8">
            {!open ? (
              <Notice tone="attention" title="Booking is closed for this date">Sales have closed or the departure is not published. Browse other dates from the trip page.</Notice>
            ) : full ? (
              <Notice tone="attention" title="This date is full">
                <p className="mt-1">
                  <Link href={`/trips/${departure.trip.slug}?departure=${departure.id}`} className="underline">Join the waitlist</Link> and we’ll invite you if a seat opens.
                </p>
              </Notice>
            ) : (
              <BookingForm
                departureId={departure.id}
                quoteVersion={departure.version}
                policyVersionId={departure.policyVersionId}
                minAge={departure.minAge}
                maxAge={departure.maxAge}
                depositPaise={quote.depositPaise}
                holdMinutes={departure.holdMinutes}
                policySummary={departure.policyRules.summary}
                tripSlug={departure.trip.slug}
              />
            )}
          </div>
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-editorial border border-rule bg-surface p-6">
            <h2 className="text-xl">Price review</h2>
            <div className="mt-4">
              <PriceTable totalPaise={departure.totalPaise} depositPaise={quote.depositPaise} balancePaise={quote.balancePaise} taxesNote={departure.taxesNote} />
            </div>
            <ul className="mt-4 space-y-2 text-meta text-ink-2">
              <li>Verification target: {departure.reviewHours} hours after the deposit. Your seat stays held meanwhile.</li>
              <li>Balance window: {departure.balanceWindowHours} hours after approval. The exact deadline is shown on your booking in IST.</li>
              <li>Cancellation: {departure.policyRules.summary}</li>
            </ul>
            <p className="mt-4 text-meta text-ink-2">
              Need help first? <Link href="/contact" className="underline">Contact support</Link>.
            </p>
          </div>
        </aside>
      </Container>
    </Section>
  );
}
