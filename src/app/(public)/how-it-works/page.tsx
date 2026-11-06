import type { Metadata } from "next";
import Link from "next/link";
import { PHOTOS } from "@/content/site";
import { Container, Section, Eyebrow, TwoColumn } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { PageHero } from "@/components/ui/page-hero";
import { Photo } from "@/components/ui/photo";

export const metadata: Metadata = { title: "How it works" };

const steps = [
  { n: "01", title: "Play nine questions", body: "Your age, your pace, the afternoon you’d pick, how you feel about plans, your kind of evening, and the first song on the bus. Three minutes, no account needed. What you hope for from the trip stays in your browser.", photo: PHOTOS.chai, caption: "The questions are about how you like a day to go, not who you are." },
  { n: "02", title: "See departures that fit, and why", body: "We rank open departures by how many of your pace, activity, structure and evening answers match what is actually scheduled, and show you the itinerary fact behind each reason. No compatibility score, no romantic prediction.", photo: PHOTOS.udaipurPalace, caption: "Udaipur, late November. Two reasons, both from the real itinerary." },
  { n: "03", title: "Reserve a seat with a 30% deposit", body: "You see the total, the deposit, the balance, the deadline rule and the cancellation terms before you pay. The deposit holds one seat for fifteen minutes at checkout, then for review. Razorpay handles the payment; we never see your card.", photo: PHOTOS.udaipurBoats, caption: "₹12,000 total, ₹3,600 today, ₹8,400 after approval. Shown before you pay." },
  { n: "04", title: "A short private verification call", body: "A reviewer confirms your identity and age on a video call where you show a government photo ID live. We record the outcome, the time and the reviewer. Nothing is scanned or stored. If the call is inconclusive you can rebook; your seat stays held.", photo: PHOTOS.walkingStreet, caption: "Everyone on the trip has done the same five-minute call." },
  { n: "05", title: "Pay the balance, meet your circle", body: "Once approved you have a clear window to pay the balance. When it lands, your seat is confirmed and your private circle opens: host, meeting point, who else is coming, and the bus playlist.", photo: PHOTOS.bonfire, caption: "Day five in the valley. Nobody had to be up early." },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHero eyebrow="How it works" title="Five steps from “who’s coming?” to “see you at breakfast”" lead="Three minutes of questions, one deposit, one five-minute call with a person, and a seat held with your name on it." photo={PHOTOS.mountains} caption="Day two of the village week: the optional ridge walk, taken by most.">
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/quiz">Find my travel circle</ButtonLink>
          <ButtonLink href="/trips" variant="secondary">
            Browse trips
          </ButtonLink>
        </div>
      </PageHero>

      <Section>
        <Container>
          <ol className="grid gap-14">
            {steps.map((s, i) => (
              <li key={s.n} className="grid items-center gap-8 lg:grid-cols-12">
                <div className={`lg:col-span-5 ${i % 2 ? "lg:order-2" : ""}`}>
                  <p className="font-display text-5xl font-bold text-action">{s.n}</p>
                  <h2 className="mt-3 text-2xl">{s.title}</h2>
                  <p className="mt-3 text-ink-2">{s.body}</p>
                </div>
                <div className={`lg:col-span-7 ${i % 2 ? "lg:order-1" : ""}`}>
                  <Photo photo={s.photo} aspect="aspect-[16/10]" sizes="(min-width: 1024px) 55vw, 100vw" caption={s.caption} />
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <Section className="bg-surface">
        <TwoColumn
          aside={
            <div className="grid gap-4">
              <Photo photo={PHOTOS.rooftop} aspect="aspect-[4/3]" sizes="(min-width: 1024px) 35vw, 100vw" />
              <div className="rounded-card border border-rule bg-paper p-5">
                <p className="font-semibold">Worked example</p>
                <dl className="mt-3 divide-y divide-rule text-meta">
                  <div className="flex justify-between py-2">
                    <dt>Total per person</dt>
                    <dd className="tabular">₹12,000</dd>
                  </div>
                  <div className="flex justify-between py-2 font-bold">
                    <dt>Deposit today</dt>
                    <dd className="tabular">₹3,600</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt>Balance after approval</dt>
                    <dd className="tabular">₹8,400</dd>
                  </div>
                </dl>
              </div>
            </div>
          }
        >
          <Eyebrow>Money, plainly</Eyebrow>
          <h2 className="text-section">What you pay, when, and what comes back</h2>
          <ul className="mt-6 list-disc space-y-3 pl-5 text-ink-2">
            <li>Prices are per person in INR, all taxes included, and fixed to the date you book.</li>
            <li>The deposit is 30% of the total, taken through Razorpay. We never see your card or UPI details.</li>
            <li>Approval starts the balance window once. If the balance is not received in time, the seat is released under the terms you accepted.</li>
            <li>If verification cannot be completed or the organiser cancels, everything you paid comes back in full.</li>
            <li>
              Refunds go back to the original payment. See <Link href="/cancellations" className="underline">cancellations</Link> for worked examples.
            </li>
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/quiz">Find my travel circle</ButtonLink>
            <ButtonLink href="/safety" variant="secondary">
              Read about safety
            </ButtonLink>
          </div>
        </TwoColumn>
      </Section>
    </>
  );
}
