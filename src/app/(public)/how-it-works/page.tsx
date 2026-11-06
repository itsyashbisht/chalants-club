import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PHOTOS } from "@/content/site";
import { Container, Section, Eyebrow, TwoColumn } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { PageHero } from "@/components/ui/page-hero";
import { Photo } from "@/components/ui/photo";
import { CallIllustration, CircleIllustration, DepositIllustration, PosterIllustration, QuizIllustration } from "@/components/ui/illustrations";

export const metadata: Metadata = { title: "How it works" };

const steps: Array<{ n: string; title: string; body: string; art: ReactNode; facts: string[] }> = [
  {
    n: "01",
    title: "Play nine questions",
    body: "Your age, your pace, the afternoon you’d pick, how you feel about plans, your kind of evening, and the first song on the bus. Three minutes, no account needed.",
    art: <QuizIllustration className="w-full text-ink" title="A quiz card with one option ticked" />,
    facts: ["One question per screen", "Back and edit any answer", "What you hope for stays in your browser"],
  },
  {
    n: "02",
    title: "See departures that fit, and why",
    body: "We rank open departures by how many of your pace, activity, structure and evening answers match what is actually scheduled, and show the itinerary fact behind each reason.",
    art: <PosterIllustration className="w-full text-ink" title="A result poster with two reasons" />,
    facts: ["No compatibility score", "No romantic prediction", "Full dates go to a waitlist"],
  },
  {
    n: "03",
    title: "Reserve a seat with a 30% deposit",
    body: "You see the total, the deposit, the balance, the deadline rule and the cancellation terms before you pay. The deposit holds one seat for fifteen minutes at checkout, then for review.",
    art: <DepositIllustration className="w-full text-ink" title="A receipt split into deposit and balance" />,
    facts: ["Razorpay handles the payment", "We never see your card", "Price fixed to the date you book"],
  },
  {
    n: "04",
    title: "A short private verification call",
    body: "A reviewer confirms your identity and age on a video call where you show a government photo ID live. We record the outcome, the time and the reviewer. Nothing is scanned or stored.",
    art: <CallIllustration className="w-full text-ink" title="A video call with a tick and nothing stored" />,
    facts: ["About five minutes", "Inconclusive? Rebook, seat stays held", "Can’t be verified? Full refund"],
  },
  {
    n: "05",
    title: "Pay the balance, meet your circle",
    body: "Once approved you have a clear window to pay the balance. When it lands, your seat is confirmed and your private circle opens: host, meeting point, who else is coming, and the bus playlist.",
    art: <CircleIllustration className="w-full text-ink" title="A bus with travellers and a playlist" />,
    facts: ["Deadline shown in IST", "First names and what people chose to share", "Your song, if you consent"],
  },
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
          <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="flex flex-col rounded-editorial border border-rule bg-surface p-6">
                <div className="rounded-card bg-tint p-4">{s.art}</div>
                <p className="mt-5 font-display text-4xl font-bold text-action">{s.n}</p>
                <h2 className="mt-2 text-2xl">{s.title}</h2>
                <p className="mt-3 text-ink-2">{s.body}</p>
                <ul className="mt-4 space-y-1.5 border-t border-rule pt-4 text-meta">
                  {s.facts.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-action" aria-hidden>
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            <li className="flex flex-col justify-between rounded-editorial bg-ink p-6 text-paper">
              <div>
                <p className="text-meta font-semibold uppercase tracking-wide text-lime">Then</p>
                <p className="mt-2 font-display text-3xl font-bold">See you at breakfast.</p>
                <p className="mt-3 text-paper/80">Your host meets you with chai and two or three people at a time. There is a seat with your name on it.</p>
              </div>
              <div className="mt-6">
                <ButtonLink href="/quiz">Start the nine questions</ButtonLink>
              </div>
            </li>
          </ol>
        </Container>
      </Section>

      <Section className="bg-surface">
        <TwoColumn
          aside={
            <div className="grid gap-4">
              <Photo photo={PHOTOS.rooftop} aspect="aspect-[4/3]" sizes="(min-width: 1024px) 35vw, 100vw" caption="Evenings are yours. This rooftop is on the Udaipur long weekend." />
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
