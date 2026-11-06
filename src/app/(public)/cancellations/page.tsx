import type { Metadata } from "next";
import { listPolicyVersions } from "@/features/trips/service";
import { PILOT_POLICY_RULES } from "@/features/bookings/policy";
import { PHOTOS } from "@/content/site";
import { Section, TwoColumn, Eyebrow } from "@/components/ui/container";
import { Notice } from "@/components/ui/notice";
import { PageHero } from "@/components/ui/page-hero";
import { Photo } from "@/components/ui/photo";

export const metadata: Metadata = { title: "Cancellations and refunds" };
export const dynamic = "force-dynamic";

export default async function CancellationsPage() {
  const versions = await listPolicyVersions().catch(() => []);
  const current = versions[0]?.rules ?? PILOT_POLICY_RULES;
  const isFixture = versions[0]?.isPilotFixture ?? true;
  return (
    <>
      <PageHero eyebrow="Cancellations and refunds" title="Exact rupees, before you confirm" lead="Plans change. Before you cancel you see a dated quote with the amount and the rule that produced it, and the money goes back to the payment it came from." photo={PHOTOS.udaipurBoats} />
      <Section>
        <TwoColumn
          aside={
            <div className="grid gap-4">
              <div className="rounded-card border border-rule bg-surface p-5">
                <p className="text-meta font-semibold uppercase tracking-wide text-ink-2">If you cancel now · example</p>
                <p className="tabular mt-2 text-3xl font-bold">₹12,000</p>
                <p className="text-meta text-ink-2">refunded of ₹12,000 collected</p>
                <ul className="mt-3 text-meta text-ink-2">
                  <li>₹8,400 to the balance payment</li>
                  <li>₹3,600 to the deposit payment</li>
                </ul>
                <p className="mt-3 text-meta text-ink-2">This is what the confirmation screen looks like. The amount is computed from your booking, not a table.</p>
              </div>
              <Photo photo={PHOTOS.heroSecondary} aspect="aspect-[4/3]" sizes="(min-width: 1024px) 35vw, 100vw" />
            </div>
          }
        >
          {isFixture ? (
            <div className="mb-6">
              <Notice tone="attention" title="Pilot terms">These are pilot fixtures. The organiser’s published terms with cut-offs, fees and timelines replace them before launch. The version you accept is recorded with your booking.</Notice>
            </div>
          ) : null}
          <Eyebrow>Current terms</Eyebrow>
          <p className="prose-measure text-lg text-ink-2">{current.summary}</p>
          <h2 className="mt-8 text-section">Worked examples</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-2">
            {current.examples.map((ex) => (
              <li key={ex}>{ex}</li>
            ))}
          </ul>
          <h2 className="mt-8 text-section">How refunds are processed</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-2">
            <li>Before you confirm a cancellation you see a dated quote with the exact amount. If the amount changes, you are asked again.</li>
            <li>Refunds go to the original payment. A booking with two instalments gets one refund per instalment, balance first.</li>
            <li>Your booking page shows each refund as requested, processed or needing attention, with the provider reference. Banks usually credit within 5–7 working days after processing.</li>
            <li>If verification fails or the organiser cancels, everything collected is refunded in full.</li>
            <li>Money that arrives after a deadline or cancellation cannot be applied and is refunded in full to the same payment.</li>
          </ul>
        </TwoColumn>
      </Section>
    </>
  );
}
