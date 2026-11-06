import Link from "next/link";
import Image from "next/image";
import { listOpenDepartures } from "@/features/trips/queries";
import { listHosts } from "@/features/trips/service";
import { getCurrentUser } from "@/lib/auth/server";
import { withDbFallback } from "@/lib/db/safe";
import { formatInr, splitInstalments } from "@/lib/money";
import { formatDateRange } from "@/lib/time";
import { FAQ, HOST_PHOTOS, MARQUEE, PHOTOS, PROMISES, STORIES } from "@/content/site";
import { QUESTIONS } from "@/features/quiz/questions";
import { Container, Section, Eyebrow } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { DepartureCard } from "@/components/ui/departure-card";
import { Photo } from "@/components/ui/photo";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [departures, hosts, user] = await Promise.all([withDbFallback([], () => listOpenDepartures()), withDbFallback([], () => listHosts()), getCurrentUser().catch(() => null)]);
  const next = departures.find((d) => d.seatsLeft > 0) ?? departures[0] ?? null;
  const showStories = process.env.APP_ENV !== "production";
  const stories = STORIES.filter((s) => s.approved || showStories);
  const sampleQuestion = QUESTIONS.find((q) => q.id === "q6");
  const example = next ? splitInstalments(next.totalPaise, next.depositBps) : null;

  return (
    <>
      {/* Hero */}
      <section className="relative isolate">
        <Container className="grid items-center gap-10 pb-10 pt-10 md:pt-16 lg:grid-cols-12 lg:pb-16">
          <div className="lg:col-span-5">
            <Eyebrow>Hosted group trips for solo adults · India</Eyebrow>
            <h1 className="text-hero">Who’s coming with you?</h1>
            <p className="prose-measure mt-5 text-lg text-ink-2">Pick your pace, your kind of evening, and the first song on the bus. Find a group trip for singles that fits, with a named host, a seat at breakfast and nobody asking why you came alone.</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/quiz" size="lg">
                Find my travel circle
              </ButtonLink>
              <ButtonLink href="/trips" variant="secondary" size="lg">
                Browse trips
              </ButtonLink>
            </div>
            <p className="mt-3 text-meta text-ink-2">9 questions · 3 minutes · no account needed</p>
            <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 text-meta sm:grid-cols-3">
              {[
                ["Verified by a person", "not an upload"],
                ["10–12 travellers", "never a coach"],
                ["Named hosts", "on the ground"],
              ].map(([a, b]) => (
                <li key={a} className="border-l-2 border-action pl-3">
                  <span className="block font-semibold">{a}</span>
                  <span className="text-ink-2">{b}</span>
                </li>
              ))}
            </ul>
            {next ? (
              <p className="mt-8 text-meta text-ink-2">
                Next departure:{" "}
                <Link href={`/trips/${next.trip.slug}?departure=${next.id}`} className="font-semibold text-ink underline">
                  {next.trip.destination}, {formatDateRange(next.startDate, next.endDate)}
                </Link>
                {next.seatsLeft > 0 && next.seatsLeft <= 3 ? ` · ${next.seatsLeft} seat${next.seatsLeft === 1 ? "" : "s"} left` : ""}
              </p>
            ) : null}
            {user ? (
              <p className="mt-2 text-meta text-ink-2">
                Signed in as {user.email}. <Link href="/account/bookings" className="underline">My bookings</Link>
              </p>
            ) : null}
          </div>
          <div className="relative lg:col-span-7">
            <Photo photo={PHOTOS.hero} priority aspect="aspect-[4/3]" sizes="(min-width: 1024px) 58vw, 100vw" />
            <div className="absolute -bottom-6 left-4 hidden w-56 rotate-[-3deg] overflow-hidden rounded-editorial border-4 border-paper shadow-lg md:block lg:-left-6">
              <Photo photo={PHOTOS.walkingStreet} aspect="aspect-[4/3]" rounded="rounded-none" sizes="224px" showCredit={false} />
            </div>
            <div className="absolute -right-2 -top-4 hidden rounded-card bg-poster px-4 py-3 font-display text-lg font-bold text-ink shadow-md md:block lg:-right-6">
              “Sit here.”
              <span className="block font-sans text-meta font-normal">what the host says at breakfast</span>
            </div>
          </div>
        </Container>
      </section>

      {/* Marquee */}
      <div className="marquee overflow-hidden bg-band py-3" aria-hidden>
        <div className="marquee-track gap-8 px-4 text-meta font-semibold uppercase tracking-wider text-lime">
          {[...MARQUEE, ...MARQUEE].map((item, i) => (
            <span key={`${item}-${i}`} className="flex items-center gap-8">
              {item}
              <span className="text-paper">✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* Departures */}
      <Section>
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Next departures</Eyebrow>
              <h2 className="text-section">Real dates. Real prices. Real hosts.</h2>
            </div>
            <Link href="/trips" className="font-semibold underline">
              See every date
            </Link>
          </div>
          {departures.length ? (
            <ul className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {departures.slice(0, 3).map((d) => (
                <li key={d.id}>
                  <DepartureCard d={d} hostName={d.host.name} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-ink-2">No departures are published yet. Dates, prices and hosts appear here once the organiser publishes inventory.</p>
          )}
        </Container>
      </Section>

      {/* How it works, numbered like a magazine feature, on Trippple's espresso band */}
      <Section className="on-dark bg-ink">
        <Container>
          <Eyebrow>How it works</Eyebrow>
          <h2 className="text-section">From “who’s coming?” to “see you at breakfast”</h2>
          <div className="mt-12 grid gap-16">
            {/* 01 */}
            <div className="grid items-center gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="font-display text-5xl font-bold text-action">01</p>
                <h3 className="mt-3 text-2xl">Play nine questions.</h3>
                <p className="mt-3 text-ink-2">Your age, your pace, the afternoon you’d pick, how you feel about plans, your kind of evening, and the first song on the bus. Three minutes. The answers you give about what you hope for stay in your browser; we never see them.</p>
                <Link href="/quiz" className="mt-4 inline-block font-semibold underline">
                  Start the quiz
                </Link>
              </div>
              <div className="lg:col-span-7">
                {sampleQuestion && sampleQuestion.kind === "choice" ? (
                  <div className="mx-auto max-w-form rounded-card border border-rule bg-paper p-6 shadow-sm">
                    <p className="text-meta font-semibold uppercase tracking-wide text-ink-2">Question 6 of 9</p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-tint" aria-hidden>
                      <div className="h-full w-2/3 bg-action" />
                    </div>
                    <p className="mt-5 font-display text-xl font-bold">{sampleQuestion.prompt}</p>
                    <ul className="mt-4 grid gap-2">
                      {sampleQuestion.options.map((o, i) => (
                        <li key={o.id} className={`flex min-h-12 items-center justify-between rounded-control border-2 px-4 font-semibold ${i === 2 ? "border-ink bg-tint" : "border-outline bg-surface"}`}>
                          {o.label}
                          {i === 2 ? <span aria-hidden>✓</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>

            {/* 02 */}
            <div className="grid items-center gap-8 lg:grid-cols-12">
              <div className="order-2 lg:order-1 lg:col-span-7">
                <div className="grid gap-4 sm:grid-cols-[5fr_7fr]">
                  <div className="rounded-editorial bg-poster p-6 text-ink">
                    <p className="text-[11px] font-semibold uppercase tracking-widest">Your travel circle</p>
                    <p className="mt-3 font-display text-4xl font-bold leading-[0.95]">Tirthan Valley</p>
                    <p className="mt-3 text-meta font-semibold">25 – 30 Dec 2026</p>
                    <p className="mt-5 border-t border-ink/30 pt-3 text-[11px] font-semibold uppercase tracking-wide">First song: Dil Chahta Hai</p>
                  </div>
                  <div className="rounded-card border border-rule bg-paper p-5 text-meta">
                    <p className="font-semibold">Why this one</p>
                    <ul className="mt-3 space-y-3">
                      <li>
                        <span className="font-semibold">You chose “Do the hike”.</span> Day 2 is a 5:30 am sunrise hike to the ridge.
                      </li>
                      <li>
                        <span className="font-semibold">You chose “Bonfire stories”.</span> Most evenings end at the bonfire.
                      </li>
                    </ul>
                    <p className="mt-4 text-ink-2">No compatibility score. No romantic prediction. Just what is actually scheduled.</p>
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2 lg:col-span-5">
                <p className="font-display text-5xl font-bold text-action">02</p>
                <h3 className="mt-3 text-2xl">See departures that fit, and why.</h3>
                <p className="mt-3 text-ink-2">We rank open departures by how many of your pace, activity, structure and evening answers match what is scheduled, then show you the itinerary fact behind each reason. Full departures go on a waitlist; ineligible ages are told the truth.</p>
              </div>
            </div>

            {/* 03 */}
            <div className="grid items-center gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="font-display text-5xl font-bold text-action">03</p>
                <h3 className="mt-3 text-2xl">Reserve a seat with a 30% deposit.</h3>
                <p className="mt-3 text-ink-2">You see the total, the deposit, the balance, the deadline rule and the cancellation terms before you pay a rupee. The deposit holds one seat while a reviewer checks you in. Payments run through Razorpay; we never see your card or UPI details.</p>
              </div>
              <div className="lg:col-span-7">
                <div className="mx-auto max-w-form rounded-card border border-rule bg-paper p-6">
                  <p className="text-meta font-semibold uppercase tracking-wide text-ink-2">Checkout summary</p>
                  <dl className="mt-3 divide-y divide-rule">
                    <div className="flex justify-between py-3">
                      <dt>Total per person</dt>
                      <dd className="tabular">{example ? formatInr(next!.totalPaise) : "₹12,000"}</dd>
                    </div>
                    <div className="flex justify-between py-3 text-lg font-bold">
                      <dt>Deposit due today</dt>
                      <dd className="tabular">{example ? formatInr(example.depositPaise) : "₹3,600"}</dd>
                    </div>
                    <div className="flex justify-between py-3">
                      <dt>Balance after approval</dt>
                      <dd className="tabular">{example ? formatInr(example.balancePaise) : "₹8,400"}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 inline-flex min-h-11 items-center rounded-full bg-action px-6 font-bold text-ink">Pay {example ? formatInr(example.depositPaise) : "₹3,600"} deposit</div>
                </div>
              </div>
            </div>

            {/* 04 */}
            <div className="grid items-center gap-8 lg:grid-cols-12">
              <div className="order-2 lg:order-1 lg:col-span-7">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Photo photo={PHOTOS.walkingStreet} aspect="aspect-[4/5]" sizes="(min-width: 1024px) 28vw, 50vw" />
                  <div className="rounded-card border border-rule bg-paper p-5">
                    <p className="text-meta font-semibold uppercase tracking-wide text-success">Deposit received · Verification next</p>
                    <p className="mt-3 text-ink-2">A reviewer confirms your identity and age on a short private video call. You show a government photo ID to the camera. Nothing is uploaded, scanned or stored.</p>
                    <ul className="mt-4 space-y-2 text-meta text-ink-2">
                      <li>✓ Outcome, time and reviewer recorded</li>
                      <li>✓ Inconclusive call? Rebook it, seat stays held</li>
                      <li>✓ Can’t be verified? Full refund, automatically</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2 lg:col-span-5">
                <p className="font-display text-5xl font-bold text-action">04</p>
                <h3 className="mt-3 text-2xl">A person checks everyone. Including you.</h3>
                <p className="mt-3 text-ink-2">That is the whole trust model. Not a selfie upload, not a social login. A reviewer, a video call, five minutes. Every traveller on the bus has done the same.</p>
                <Link href="/safety" className="mt-4 inline-block font-semibold underline">
                  Exactly what we check
                </Link>
              </div>
            </div>

            {/* 05 */}
            <div className="grid items-center gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="font-display text-5xl font-bold text-action">05</p>
                <h3 className="mt-3 text-2xl">Pay the balance. Meet your circle.</h3>
                <p className="mt-3 text-ink-2">Once approved you have a clear window to pay the rest. When it lands, your private circle opens: your host, the meeting point, who else is coming (first names and whatever they chose to share), and the bus playlist.</p>
              </div>
              <div className="lg:col-span-7">
                <div className="grid gap-4 sm:grid-cols-[7fr_5fr]">
                  <div className="rounded-card border border-rule bg-paper p-5">
                    <p className="text-meta font-semibold uppercase tracking-wide text-ink-2">Your circle · Udaipur</p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {["Priya", "Karan", "Meera", "Dev", "Sana", "Ananya", "Rahul", "Nikita", "you"].map((n) => (
                        <li key={n} className={`rounded-full px-3 py-1 text-meta font-semibold ${n === "you" ? "bg-action text-ink" : "bg-tint"}`}>
                          {n}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 text-meta font-semibold">Bus playlist</p>
                    <ul className="mt-1 text-meta text-ink-2">
                      <li>Dil Chahta Hai · Shankar-Ehsaan-Loy</li>
                      <li>Ilahi · Arijit Singh</li>
                      <li>Kesariya · Pritam</li>
                    </ul>
                  </div>
                  <Photo photo={PHOTOS.bonfire} aspect="aspect-[4/5]" sizes="(min-width: 1024px) 22vw, 40vw" />
                </div>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* A day with us */}
      <Section>
        <Container>
          <Eyebrow>What a day looks like</Eyebrow>
          <h2 className="text-section">Slow mornings, one real plan, long evenings</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <Photo photo={PHOTOS.sunrise} caption="5:30 am · The optional one. Four people went. Someone made chai." sizes="(min-width: 768px) 33vw, 100vw" />
            <Photo photo={PHOTOS.foodCart} caption="4 pm · The food walk. Your host knows which stall, and which one to skip." sizes="(min-width: 768px) 33vw, 100vw" />
            <Photo photo={PHOTOS.evening} caption="9 pm · No plan. Cards, a fire if it’s cold, or a quiet corner." sizes="(min-width: 768px) 33vw, 100vw" />
          </div>
        </Container>
      </Section>

      {/* Hosts */}
      <Section className="bg-surface">
        <Container>
          <Eyebrow>The people who host</Eyebrow>
          <h2 className="text-section">Not tour leaders. Hosts.</h2>
          <p className="prose-measure mt-3 text-ink-2">Every departure has one named host who is there the whole time. They meet you with chai, not a clipboard, and they are the person you message when something is off.</p>
          <ul className="mt-8 grid gap-8 md:grid-cols-2">
            {hosts.map((h) => {
              const portrait = h.photoUrl ? { src: h.photoUrl, alt: `Portrait of ${h.name}`, credit: "Unsplash" } : HOST_PHOTOS[h.name];
              return (
                <li key={h.id} className="grid gap-5 sm:grid-cols-[160px_1fr]">
                  {portrait ? (
                    <div className="relative aspect-square w-40 overflow-hidden rounded-editorial bg-tint">
                      <Image src={portrait.src} alt={portrait.alt} fill sizes="160px" className="object-cover" />
                    </div>
                  ) : (
                    <div className="flex aspect-square w-40 items-center justify-center rounded-editorial bg-tint font-display text-4xl">{h.name[0]}</div>
                  )}
                  <div>
                    <p className="text-xl font-bold">{h.name}</p>
                    <p className="mt-2 text-ink-2">{h.bio}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Container>
      </Section>

      {/* Promises */}
      <Section>
        <Container>
          <Eyebrow>What we promise</Eyebrow>
          <h2 className="text-section">The boring details that make it safe to say yes</h2>
          <ul className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
            {PROMISES.map((p) => (
              <li key={p.title} className="border-t-2 border-rule pt-4">
                <h3 className="text-lg">{p.title}</h3>
                <p className="mt-2 text-ink-2">{p.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* Stories */}
      {stories.length ? (
        <Section className="bg-tint">
          <Container>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>From the pilot circles</Eyebrow>
                <h2 className="text-section">What people said afterwards</h2>
              </div>
              {showStories && stories.some((s) => !s.approved) ? <span className="rounded-full border border-attention px-3 py-1 text-meta font-semibold text-attention">Preview: sample stories, pending traveller permission</span> : null}
            </div>
            <ul className="mt-8 columns-1 gap-6 md:columns-2 lg:columns-3 [&>li]:mb-6 [&>li]:break-inside-avoid">
              {stories.map((s) => (
                <li key={s.name + s.trip} className="rounded-card border border-rule bg-surface p-6">
                  <p className="font-display text-3xl leading-none text-action" aria-hidden>
                    “
                  </p>
                  <blockquote className="mt-1 text-lg leading-snug">{s.quote}</blockquote>
                  <footer className="mt-4 flex items-center gap-3 text-meta">
                    <span className="flex size-9 items-center justify-center rounded-full bg-poster font-display font-bold text-ink">{s.name[0]}</span>
                    <span>
                      <span className="block font-semibold">
                        {s.name} · {s.detail}
                      </span>
                      <span className="text-ink-2">{s.trip}</span>
                    </span>
                  </footer>
                </li>
              ))}
            </ul>
          </Container>
        </Section>
      ) : null}

      {/* FAQ */}
      <Section>
        <Container narrow>
          <Eyebrow>Questions people ask</Eyebrow>
          <h2 className="text-section">Before you say yes</h2>
          <div className="mt-6 divide-y divide-rule border-y border-rule">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden className="text-2xl text-action transition-transform duration-150 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-meta text-ink-2">
            Something else? <Link href="/contact" className="underline">Ask a person</Link>.
          </p>
        </Container>
      </Section>

      {/* Closing CTA: orange band, as on Trippple */}
      <section className="bg-action">
        <Container className="grid items-center gap-8 py-20 md:py-24 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <p className="text-meta font-semibold uppercase tracking-widest text-ink/80">Who’s coming with you?</p>
            <h2 className="mt-3 font-display text-hero text-ink">Nine questions. One seat at breakfast.</h2>
          </div>
          <div className="flex flex-wrap gap-3 lg:col-span-4 lg:justify-end">
            <ButtonLink href="/quiz" size="lg" className="bg-ink text-paper hover:bg-band">
              Find my travel circle
            </ButtonLink>
            <ButtonLink href="/trips" variant="secondary" size="lg" className="border-ink bg-transparent text-ink hover:bg-ink/10">
              Browse trips
            </ButtonLink>
          </div>
          <p className="text-meta text-ink/80 lg:col-span-12">
            Pilot programme. Departures marked as fixtures are placeholders until the organiser publishes real inventory. <Link href="/about" className="underline">About us</Link>
          </p>
        </Container>
      </section>
    </>
  );
}
