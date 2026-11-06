import type { Metadata } from "next";
import Link from "next/link";
import { PHOTOS } from "@/content/site";
import { Container, Section, Eyebrow, TwoColumn } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Photo } from "@/components/ui/photo";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Safety" };

const checks = [
  { title: "Identity and age, by a person", body: "After the deposit, an authorised reviewer holds a short private video call. You show an accepted government photo ID live. We record only: verified or not, when, and which reviewer." },
  { title: "No scans, no numbers", body: "We never store copies of documents or document numbers. Reviewers cannot see your quiz answers or what you hope for from the trip." },
  { title: "Self-attestation", body: "Every traveller confirms they are single and accepts the conduct rules when reserving. Breaking those rules is grounds for removal." },
  { title: "Consistent decisions", body: "Only identity, age and conduct eligibility are reviewed. Taste, dating preferences and how you answered the game are private and never grounds for rejection." },
  { title: "Inconclusive is not a no", body: "If a call cannot be completed you can rebook it. If a reviewer cannot complete verification, the seat is released and your deposit is refunded in full." },
];

export default function SafetyPage() {
  const supportEmail = process.env.SUPPORT_EMAIL || "support@example.com";
  return (
    <>
      <PageHero eyebrow="Safety" title="Exactly what we check, and what we don’t" lead="One trust model, applied to every traveller the same way: a person, a video call, five minutes. Here is the whole thing." photo={PHOTOS.walkingStreet} caption="A group on the old-city walk. Every one of them did the same call." />

      <Section>
        <Container>
          <Eyebrow>Before anyone travels</Eyebrow>
          <h2 className="text-section">Five things, nothing hidden</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {checks.map((c, i) => (
              <li key={c.title} className="rounded-card border border-rule bg-surface p-6">
                <p className="font-display text-3xl font-bold text-action">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mt-2 text-xl">{c.title}</h3>
                <p className="mt-2 text-ink-2">{c.body}</p>
              </li>
            ))}
            <li className="overflow-hidden rounded-card">
              <Photo photo={PHOTOS.chai} aspect="aspect-[4/3]" rounded="rounded-card" sizes="(min-width: 1024px) 30vw, 100vw" />
            </li>
          </ol>
        </Container>
      </Section>

      <Section className="bg-surface">
        <TwoColumn
          aside={
            <div className="grid gap-4">
              <Photo photo={PHOTOS.rooftop} aspect="aspect-[4/3]" sizes="(min-width: 1024px) 35vw, 100vw" caption="Same-gender twin rooms by default. Room plans on every trip page." />
              <div className="rounded-card bg-band p-5 text-paper">
                <p className="text-meta font-semibold uppercase tracking-wide text-lime">Private help on the trip</p>
                <p className="mt-2">Message your host, or write to staff. Reports never go to other travellers.</p>
                <p className="mt-3">
                  <a href={`mailto:${supportEmail}`} className="font-semibold text-lime underline">
                    {supportEmail}
                  </a>
                </p>
              </div>
            </div>
          }
        >
          <Eyebrow>On the trip</Eyebrow>
          <h2 className="text-section">Hosts, rooms, and the right to say no</h2>
          <ul className="mt-6 list-disc space-y-3 pl-5 text-ink-2">
            <li><strong className="text-ink">Named hosts.</strong> Every departure has a named host who is on the ground throughout. Hosts see only confirmed attendees and the welcome preferences those people chose to share.</li>
            <li><strong className="text-ink">Rooms.</strong> Twin-share, same-gender by default. A private room is an extra cost where the stay allows it.</li>
            <li><strong className="text-ink">Optional means optional.</strong> Sunrise hikes, karaoke and cooking classes are never required. Sleeping in is a perfectly good plan.</li>
            <li><strong className="text-ink">Private help.</strong> Message the host directly or write to staff. You can ask to switch rooms or leave a group activity without explaining why.</li>
          </ul>
          <h2 className="mt-10 text-section">After the trip</h2>
          <p className="mt-4 text-ink-2">Contact details are shared only when two people who both travelled choose each other, privately, after the trip is completed. You can opt out or revoke sharing at any time from your circle page.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/contact" variant="secondary">
              Contact us privately
            </ButtonLink>
            <ButtonLink href="/trips">Browse trips</ButtonLink>
          </div>
          <p className="mt-6 text-meta text-ink-2">
            Related: <Link href="/terms" className="underline">terms</Link> · <Link href="/privacy" className="underline">privacy</Link>
          </p>
        </TwoColumn>
      </Section>
    </>
  );
}
