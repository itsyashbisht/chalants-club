import type { Metadata } from "next";
import Link from "next/link";
import { PHOTOS } from "@/content/site";
import { Section, TwoColumn } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Photo } from "@/components/ui/photo";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  const operator = process.env.OPERATOR_NAME || "Chalants Club";
  return (
    <>
      <PageHero eyebrow="Terms · pilot draft v1" title="Terms of booking" lead="Policies are versioned. The version you accept when reserving is recorded with your booking and applies to it even if these pages change later." photo={PHOTOS.rajasthanGold} />
      <Section>
        <TwoColumn
          aside={
            <div className="grid gap-4">
              <div className="rounded-card border border-rule bg-surface p-5 text-meta">
                <p className="font-semibold">In one breath</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">
                  <li>One adult per booking, 18+, within the departure’s age range</li>
                  <li>30% deposit holds the seat, subject to a verification call</li>
                  <li>Balance due in a window after approval</li>
                  <li>Late money is refunded, never applied</li>
                  <li>Conduct rules apply to everyone, including hosts</li>
                </ul>
                <p className="mt-3">
                  <Link href="/cancellations" className="underline">Cancellations and refunds</Link> · <Link href="/privacy" className="underline">Privacy</Link>
                </p>
              </div>
              <Photo photo={PHOTOS.stars} aspect="aspect-[4/3]" sizes="(min-width: 1024px) 35vw, 100vw" />
            </div>
          }
        >
          <ol className="list-decimal space-y-4 pl-5 text-ink-2">
            <li><strong className="text-ink">Who can book.</strong> One adult traveller per booking, aged 18 or over and within the age range published for the departure. You confirm that you are single and accept the conduct rules.</li>
            <li><strong className="text-ink">Reservation.</strong> A booking is reserved when a captured deposit of 30% of the total is applied before the checkout hold ends. The price and policy version are fixed at that moment.</li>
            <li><strong className="text-ink">Verification.</strong> Reservation is subject to a private identity and age check by an authorised reviewer. If verification cannot be completed, the seat is released and all money collected is refunded.</li>
            <li><strong className="text-ink">Balance.</strong> Approval opens a window (shown on your booking in IST) to pay the balance. If it is not received in time, the seat is released and the deposit is treated under the cancellation terms you accepted.</li>
            <li><strong className="text-ink">Timing rule.</strong> A payment counts only if it is captured and applied while the booking is still active at the moment our server processes it. Money that arrives after a deadline or cancellation is refunded in full to the same payment, even if a seat is still free.</li>
            <li><strong className="text-ink">Cancellation.</strong> See <Link href="/cancellations" className="underline">cancellations and refunds</Link>. Refunds are made to the original payment method.</li>
            <li><strong className="text-ink">Conduct.</strong> Harassment, discrimination or unsafe behaviour towards travellers, hosts or local partners leads to removal from the trip without refund of the balance, and may be reported to the authorities.</li>
            <li><strong className="text-ink">Changes by {operator}.</strong> If we cancel a departure, every captured instalment is refunded in full. Minor itinerary changes for weather or safety do not qualify for a refund.</li>
            <li><strong className="text-ink">Liability and insurance.</strong> Travel insurance is your responsibility. Full liability terms, merchant identity and governing law are added before launch.</li>
          </ol>
        </TwoColumn>
      </Section>
    </>
  );
}
