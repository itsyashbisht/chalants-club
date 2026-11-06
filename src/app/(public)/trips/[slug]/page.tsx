import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTripBySlug } from "@/features/trips/queries";
import { splitInstalments, formatInr } from "@/lib/money";
import { formatDateRange, formatIstDateTime, nowMs } from "@/lib/time";
import { Container, Section, Eyebrow, Rule } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { PriceTable } from "@/components/ui/price-table";
import { Notice } from "@/components/ui/notice";
import { WaitlistForm } from "./waitlist-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getTripBySlug(slug);
  return { title: data ? data.trip.title : "Trip" };
}

export default async function TripPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const data = await getTripBySlug(slug);
  if (!data) notFound();
  const { trip, days, departures } = data;
  const requested = typeof query.departure === "string" ? query.departure : null;
  const selected = departures.find((d) => d.id === requested) ?? departures[0] ?? null;
  const quote = selected ? splitInstalments(selected.totalPaise, selected.depositBps) : null;
  const full = selected ? selected.seatsLeft <= 0 : false;
  const open = selected ? selected.status === "published" && selected.salesCloseAt.getTime() > nowMs() : false;
  const supportEmail = process.env.SUPPORT_EMAIL || "support@example.com";

  return (
    <>
      <Section className="pb-0">
        <Container>
          <Eyebrow>
            {trip.destination} · {trip.region}
          </Eyebrow>
          <h1 className="text-title">{trip.title}</h1>
          <p className="prose-measure mt-4 text-lg text-ink-2">{trip.summary}</p>
          {trip.isPilot ? (
            <div className="mt-5">
              <Notice tone="attention" title="Pilot fixture">This departure is an internal fixture for testing. Dates, prices and photography are placeholders until the organiser publishes real inventory.</Notice>
            </div>
          ) : null}
        </Container>
      </Section>

      <Section>
        <Container className="grid gap-10 lg:grid-cols-[7fr_5fr]">
          <div className="min-w-0">
            {departures.length > 1 ? (
              <nav aria-label="Select a date" className="mb-8">
                <p className="mb-3 font-semibold">Choose a date</p>
                <ul className="flex flex-wrap gap-2">
                  {departures.map((d) => (
                    <li key={d.id}>
                      <Link href={`/trips/${trip.slug}?departure=${d.id}`} aria-current={selected?.id === d.id ? "true" : undefined} className={`inline-flex min-h-11 items-center rounded-full border-2 px-5 font-bold ${selected?.id === d.id ? "border-ink bg-tint" : "border-outline bg-surface"}`}>
                        {formatDateRange(d.startDate, d.endDate)}
                        {d.seatsLeft <= 0 ? " · Full" : ""}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}

            {trip.heroImageUrl ? (
              <figure>
                <div className="relative aspect-[16/10] overflow-hidden rounded-editorial bg-tint">
                  <Image src={trip.heroImageUrl} alt={trip.heroImageAlt ?? ""} fill priority sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
                </div>
                {trip.heroImageCredit ? <figcaption className="mt-2 text-meta text-ink-2">{trip.heroImageCredit}</figcaption> : null}
              </figure>
            ) : (
              <figure className="overflow-hidden rounded-editorial bg-tint">
                <div className="flex aspect-[4/3] items-end bg-[linear-gradient(160deg,#F0EAD6_0%,#C8F520_100%)] p-6">
                  <figcaption className="rounded-control bg-paper/90 px-4 py-3 text-meta text-ink-2">{trip.heroImageAlt ?? "Destination imagery placeholder"}</figcaption>
                </div>
              </figure>
            )}
            {trip.galleryUrls.length ? (
              <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {trip.galleryUrls.slice(0, 4).map((g) => (
                  <li key={g.src} className="relative aspect-square overflow-hidden rounded-tile bg-tint">
                    <Image src={g.src} alt={g.alt} fill sizes="(min-width: 768px) 15vw, 45vw" className="object-cover" />
                  </li>
                ))}
              </ul>
            ) : null}

            <h2 className="mt-10 text-section">Day by day</h2>
            <ol className="mt-6 space-y-6">
              {days.map((day) => (
                <li key={day.id} className="grid gap-1 border-l-2 border-rule pl-5">
                  <p className="text-meta font-semibold uppercase tracking-wide text-ink-2">Day {day.dayNumber}</p>
                  <h3 className="text-xl">{day.title}</h3>
                  <p className="text-ink-2">{day.description}</p>
                </li>
              ))}
            </ol>

            <Rule className="my-10" />
            <h2 className="text-section">The practical bits</h2>
            <dl className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <dt className="font-semibold">Pace</dt>
                <dd className="text-ink-2">{trip.pace}</dd>
              </div>
              <div>
                <dt className="font-semibold">Eligible ages</dt>
                <dd className="text-ink-2">{selected ? `${selected.minAge}–${selected.maxAge}` : "Set per departure"}</dd>
              </div>
              <div>
                <dt className="font-semibold">Meeting point area</dt>
                <dd className="text-ink-2">{trip.meetingPointArea}</dd>
              </div>
              <div>
                <dt className="font-semibold">Stay and rooms</dt>
                <dd className="text-ink-2">{trip.roomPlan}</dd>
              </div>
              <div>
                <dt className="font-semibold">Included</dt>
                <dd>
                  <ul className="list-disc pl-5 text-ink-2">
                    {trip.inclusions.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Extra costs</dt>
                <dd>
                  <ul className="list-disc pl-5 text-ink-2">
                    {trip.extraCosts.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>

            <div className="prose-measure mt-8 whitespace-pre-line text-ink-2">{trip.description}</div>

            {selected ? (
              <>
                <Rule className="my-10" />
                <h2 className="text-section">Your host</h2>
                <div className="mt-4 grid gap-5 sm:grid-cols-[140px_1fr]">
                  {selected.hostPhotoUrl ? (
                    <div className="relative aspect-square w-36 overflow-hidden rounded-editorial bg-tint">
                      <Image src={selected.hostPhotoUrl} alt={`Portrait of ${selected.host.name}`} fill sizes="144px" className="object-cover" />
                    </div>
                  ) : null}
                  <div>
                    <p className="text-lg font-semibold">{selected.host.name}</p>
                    <p className="prose-measure mt-2 text-ink-2">{selected.hostBio}</p>
                  </div>
                </div>

                <Rule className="my-10" />
                <h2 className="text-section">What we check, and how to get help</h2>
                <p className="prose-measure mt-3 text-ink-2">After your deposit a reviewer confirms your identity and age on a short private video call. We record only the outcome, time and reviewer. Hosts see only confirmed attendees and the welcome preferences those travellers choose to share.</p>
                <p className="prose-measure mt-3 text-ink-2">
                  Private help during the trip: message the host directly or write to <a href={`mailto:${supportEmail}`} className="underline">{supportEmail}</a>. Reports never go to other travellers. See <Link href="/safety" className="underline">Safety</Link>.
                </p>

                <Rule className="my-10" />
                <h2 className="text-section">Cancellation terms for this date</h2>
                <p className="prose-measure mt-3 text-ink-2">{selected.policyRules.summary}</p>
                <ul className="mt-3 list-disc pl-5 text-ink-2">
                  {selected.policyRules.examples.map((ex) => (
                    <li key={ex}>{ex}</li>
                  ))}
                </ul>
                <p className="mt-3 text-meta text-ink-2">
                  Policy {selected.policyName} v{selected.policyVersion}. <Link href="/cancellations" className="underline">Full terms</Link>.
                </p>
              </>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            {selected && quote ? (
              <div className="rounded-editorial border border-rule bg-surface p-6">
                <p className="text-meta font-semibold uppercase tracking-wide text-ink-2">Selected date</p>
                <p className="mt-1 text-xl font-bold">{formatDateRange(selected.startDate, selected.endDate)}</p>
                <p className="text-ink-2">
                  {trip.durationDays} days · ages {selected.minAge}–{selected.maxAge} · {selected.seatsLeft > 0 ? `${selected.seatsLeft} of ${selected.capacity} seats left` : "Full"}
                </p>
                <div className="mt-5">
                  <PriceTable totalPaise={selected.totalPaise} depositPaise={quote.depositPaise} balancePaise={quote.balancePaise} taxesNote={selected.taxesNote} />
                </div>
                <p className="mt-3 text-meta text-ink-2">Deposit holds a seat for {selected.holdMinutes} minutes at checkout, then for human verification (target {selected.reviewHours} hours). After approval you have {selected.balanceWindowHours} hours to pay the balance. Sales close {formatIstDateTime(selected.salesCloseAt)}.</p>
                <div className="mt-6 hidden lg:block">
                  {full ? (
                    <>
                      <p className="mb-3 font-semibold">This date is full. Join the waitlist:</p>
                      <WaitlistForm departureId={selected.id} />
                    </>
                  ) : open ? (
                    <ButtonLink href={`/book/${selected.id}`} size="lg" className="w-full">
                      Reserve a seat · {formatInr(quote.depositPaise)} deposit
                    </ButtonLink>
                  ) : (
                    <Notice tone="neutral" title="Booking closed">Sales for this date have closed.</Notice>
                  )}
                </div>
                {full ? (
                  <div className="mt-6 lg:hidden">
                    <p className="mb-3 font-semibold">This date is full. Join the waitlist:</p>
                    <WaitlistForm departureId={selected.id} />
                  </div>
                ) : null}
              </div>
            ) : (
              <Notice tone="neutral" title="No dates published">Check back soon or take the quiz to hear about new departures.</Notice>
            )}
          </aside>
        </Container>
      </Section>

      {selected && quote && !full && open ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper/95 px-4 pt-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-page items-center justify-between gap-4">
            <p className="text-meta">
              <span className="tabular block text-lg font-bold">{formatInr(selected.totalPaise)}</span>
              {formatDateRange(selected.startDate, selected.endDate)}
            </p>
            <ButtonLink href={`/book/${selected.id}`}>Reserve · {formatInr(quote.depositPaise)} deposit</ButtonLink>
          </div>
        </div>
      ) : null}
      {selected && quote && !full && open ? <div className="h-24 lg:hidden" aria-hidden /> : null}
    </>
  );
}
