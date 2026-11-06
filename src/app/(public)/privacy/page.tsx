import type { Metadata } from "next";
import Link from "next/link";
import { PHOTOS } from "@/content/site";
import { Section, TwoColumn } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { PrivacyIllustration } from "@/components/ui/illustrations";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <>
      <PageHero eyebrow="Privacy · pilot draft v1" title="What we keep, and for how long" lead="Less than you’d expect. No document scans, no quiz answers shown to anyone, no contact details shared unless two people choose each other." photo={PHOTOS.tirthanRidge} />
      <Section>
        <TwoColumn
          aside={
            <div className="grid gap-4">
              <div className="rounded-card bg-band p-5 text-paper">
                <p className="text-meta font-semibold uppercase tracking-wide text-lime">Never stored</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>Document images or numbers</li>
                  <li>Your card, UPI or bank details</li>
                  <li>The private quiz answer about what you hope for</li>
                </ul>
              </div>
              <div className="rounded-card bg-tint p-6">
                <PrivacyIllustration className="w-full text-ink" />
              </div>
            </div>
          }
        >
          <h2 className="text-section">What we collect</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-2">
            <li><strong className="text-ink">Account:</strong> your name and email through our sign-in provider.</li>
            <li><strong className="text-ink">Quiz answers:</strong> kept in your browser tab while you play. Saved to your account only if you choose. Stored with a booking without the private question about what you hope for, which is never sent to us.</li>
            <li><strong className="text-ink">Booking and payments:</strong> amounts, provider references and timestamps. Card, UPI and bank details are handled by Razorpay and never reach us.</li>
            <li><strong className="text-ink">Verification:</strong> the outcome, time and reviewer of your call. No document images or numbers.</li>
            <li><strong className="text-ink">Circle:</strong> the intro and welcome preference you choose to share, a song if you consent, and reconnect choices after a trip.</li>
          </ul>
          <h2 className="mt-8 text-section">What we don’t do</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-2">
            <li>We never show hosts or other travellers your answers, your intent or your contact details.</li>
            <li>Song titles, romantic intent, contact data, ID details and raw answers are kept out of analytics and logs.</li>
            <li>We never share your email with other travellers unless you both choose to reconnect after the trip.</li>
          </ul>
          <h2 className="mt-8 text-section">Retention and deletion</h2>
          <p className="mt-4 text-ink-2">Optional profile and quiz data is deleted on request. Financial records (bookings, payments, refunds, review outcomes) are retained for the period required by Indian tax and payments regulation, then deleted. Backups are encrypted and access-restricted. Ask for deletion through the <Link href="/contact" className="underline">contact form</Link>.</p>
        </TwoColumn>
      </Section>
    </>
  );
}
