import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePageUser } from "@/lib/auth/pages";
import { loadBookingForViewer, toStatusView } from "@/features/bookings/status";
import { isAppError } from "@/lib/errors";
import { formatIstDateTime } from "@/lib/time";
import { Container, Section, Eyebrow } from "@/components/ui/container";
import { Notice } from "@/components/ui/notice";
import { ButtonLink } from "@/components/ui/button";
import { ReviewCallForm } from "@/features/bookings/booking-client";

export const metadata: Metadata = { title: "Verification", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function VerificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requirePageUser(`/account/bookings/${id}/verification`);
  let loaded;
  try {
    loaded = await loadBookingForViewer(id, user);
  } catch (error: unknown) {
    if (isAppError(error) && error.status === 404) notFound();
    throw error;
  }
  const view = toStatusView(loaded.detail);
  return (
    <Section>
      <Container narrow>
        <Eyebrow>
          <Link href={`/account/bookings/${view.id}`} className="underline">
            Booking {view.reference}
          </Link>
        </Eyebrow>
        <h1 className="text-title">Your verification call</h1>
        {view.state !== "UNDER_REVIEW" ? (
          <div className="mt-6">
            <Notice tone={view.state === "HELD" ? "attention" : "neutral"} title={view.state === "HELD" ? "Pay the deposit first" : view.review?.decision === "approved" ? "Verification complete" : "No verification pending"}>
              <p className="mt-1">
                {view.state === "HELD" ? "The review starts once your deposit is received." : view.review?.decision === "approved" ? "You’re approved. Continue to the balance." : "This booking is not under review."}
              </p>
              <p className="mt-2">
                <Link href={`/account/bookings/${view.id}`} className="underline">
                  Back to the booking
                </Link>
              </p>
            </Notice>
          </div>
        ) : (
          <>
            <ol className="mt-6 list-decimal space-y-3 pl-5 text-ink-2">
              <li>Request a slot below. A reviewer confirms by email.</li>
              <li>On the call, show an accepted government photo ID (Aadhaar, passport, driving licence or voter ID) to the camera. Nothing is uploaded or stored.</li>
              <li>The reviewer records only the outcome, time and their name. If the call is inconclusive you can rebook; the seat stays held.</li>
            </ol>
            {view.reviewDueAt ? <p className="mt-4 text-meta text-ink-2">Target: a decision by {formatIstDateTime(view.reviewDueAt)}.</p> : null}
            {view.review?.decision === "info_requested" ? (
              <div className="mt-6">
                <Notice tone="attention" title="The reviewer needs another go">The last call could not be completed. Request a new slot below or contact support.</Notice>
              </div>
            ) : null}
            <div className="mt-8 rounded-editorial border border-rule bg-surface p-6">
              <ReviewCallForm bookingId={view.id} requestedAt={view.review?.callRequestedAt ?? null} />
            </div>
            <p className="mt-6 text-meta text-ink-2">
              Something not right, or need to escalate? <Link href="/contact" className="underline">Contact support privately</Link>.
            </p>
          </>
        )}
        <div className="mt-8">
          <ButtonLink href={`/account/bookings/${view.id}`} variant="secondary">
            Back to booking
          </ButtonLink>
        </div>
      </Container>
    </Section>
  );
}
