import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth/pages";
import { listBookingsForOwner } from "@/features/bookings/service";
import { STATE_COPY, stateTone } from "@/features/bookings/view";
import { formatDateRange } from "@/lib/time";
import { formatInr } from "@/lib/money";
import { Container, Section, Eyebrow } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "My bookings", robots: { index: false } };
export const dynamic = "force-dynamic";

const toneClass = { success: "text-success", attention: "text-attention", error: "text-error", neutral: "text-ink-2" } as const;

export default async function BookingsPage() {
  const user = await requirePageUser("/account/bookings");
  const rows = await listBookingsForOwner(user.id);
  return (
    <Section>
      <Container>
        <Eyebrow>Account</Eyebrow>
        <h1 className="text-title">My bookings</h1>
        {rows.length === 0 ? (
          <div className="mt-8 max-w-form rounded-editorial border border-rule bg-surface p-8">
            <p className="text-lg font-semibold">Nothing booked yet</p>
            <p className="mt-2 text-ink-2">Play the nine questions to find a departure that fits, or browse every open date.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <ButtonLink href="/quiz">Find my travel circle</ButtonLink>
              <ButtonLink href="/trips" variant="secondary">
                Browse trips
              </ButtonLink>
            </div>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4">
            {rows.map(({ booking, departure, trip }) => (
              <li key={booking.id} className="rounded-control border border-rule bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`text-meta font-semibold uppercase tracking-wide ${toneClass[stateTone(booking.state)]}`}>{STATE_COPY[booking.state].heading}</p>
                    <h2 className="mt-1 text-xl">
                      <Link href={`/account/bookings/${booking.id}`} className="hover:underline">
                        {trip.destination} · {formatDateRange(departure.startDate, departure.endDate)}
                      </Link>
                    </h2>
                    <p className="text-ink-2">
                      {trip.title} · ref {booking.reference}
                    </p>
                  </div>
                  <p className="tabular text-right">
                    <span className="block text-lg font-bold">{formatInr(booking.totalPaise)}</span>
                    <span className="text-meta text-ink-2">total</span>
                  </p>
                </div>
                <div className="mt-4">
                  <ButtonLink href={`/account/bookings/${booking.id}`} variant="secondary">
                    Open booking
                  </ButtonLink>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </Section>
  );
}
