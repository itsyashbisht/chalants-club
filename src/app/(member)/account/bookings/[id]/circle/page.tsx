import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePageUser } from "@/lib/auth/pages";
import { getCircle } from "@/features/circle/service";
import { isAppError } from "@/lib/errors";
import { formatDateRange } from "@/lib/time";
import { Container, Section, Eyebrow, Rule } from "@/components/ui/container";
import { Notice } from "@/components/ui/notice";
import { PreferencesForm, TrackForm, ReconnectButton } from "@/features/circle/circle-client";

export const metadata: Metadata = { title: "Your circle", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requirePageUser(`/account/bookings/${id}/circle`);
  let circle;
  try {
    circle = await getCircle(id, user.id);
  } catch (error: unknown) {
    if (isAppError(error) && error.status === 404) notFound();
    if (isAppError(error) && error.status === 403) {
      return (
        <Section>
          <Container narrow>
            <Notice tone="attention" title="Your circle opens once your seat is confirmed">
              <p className="mt-1">
                <Link href={`/account/bookings/${id}`} className="underline">
                  Back to the booking
                </Link>
              </p>
            </Notice>
          </Container>
        </Section>
      );
    }
    throw error;
  }
  const myTrack = circle.tracks.find((t) => t.mine) ?? null;
  const others = circle.members.filter((m) => !m.isMe);
  return (
    <Section>
      <Container>
        <Eyebrow>
          <Link href={`/account/bookings/${circle.booking.id}`} className="underline">
            Booking {circle.booking.reference}
          </Link>
        </Eyebrow>
        <h1 className="text-title">Your circle · {circle.trip.destination}</h1>
        <p className="mt-2 text-ink-2">{formatDateRange(circle.departure.startDate, circle.departure.endDate)}</p>

        <div className="mt-8 grid gap-10 lg:grid-cols-[7fr_5fr]">
          <div className="grid gap-8">
            <section className="rounded-editorial border border-rule bg-surface p-6">
              <h2 className="text-xl">Your host: {circle.host.name}</h2>
              <p className="mt-2 text-ink-2">{circle.host.bio}</p>
              <dl className="mt-4 grid gap-3 text-meta sm:grid-cols-2">
                <div>
                  <dt className="font-semibold">Meeting point area</dt>
                  <dd className="text-ink-2">{circle.trip.meetingPointArea}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Rooms</dt>
                  <dd className="text-ink-2">{circle.trip.roomPlan}</dd>
                </div>
              </dl>
              <p className="mt-4 text-meta text-ink-2">On arrival: your host meets you with chai and two or three people at a time. Optional activities stay optional.</p>
            </section>

            <section>
              <h2 className="text-xl">Who’s coming ({circle.members.length})</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {circle.members.map((m) => (
                  <li key={m.userId} className="rounded-control border border-rule bg-surface p-4">
                    <p className="font-semibold">
                      {m.firstName}
                      {m.isMe ? " (you)" : ""}
                    </p>
                    {m.intro ? <p className="mt-1 text-meta text-ink-2">{m.intro}</p> : null}
                    {m.welcomePreference ? <p className="mt-1 text-meta text-ink-2">First hello: {m.welcomePreference}</p> : null}
                    {circle.reconnect.enabled && !m.isMe && m.attended ? (
                      <div className="mt-2 text-right">
                        <ReconnectButton departureId={circle.departure.id} toUserId={m.userId} chosen={circle.reconnect.chosen.includes(m.userId)} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-xl">The bus playlist</h2>
              {circle.tracks.length ? (
                <ul className="mt-3 list-disc pl-5 text-ink-2">
                  {circle.tracks.map((t) => (
                    <li key={`${t.title}-${t.artist}`}>
                      {t.title} · {t.artist}
                      {t.mine && !t.approved ? " (awaiting host approval)" : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-ink-2">No approved tracks yet.</p>
              )}
              <div className="mt-4">
                <TrackForm bookingId={circle.booking.id} departureId={circle.departure.id} initial={myTrack ? { title: myTrack.title, artist: myTrack.artist } : (circle.booking.quizSnapshot?.track ?? null)} />
              </div>
            </section>

            {circle.departure.status === "completed" ? (
              <section>
                <Rule className="mb-6" />
                <h2 className="text-xl">Reconnect, privately</h2>
                {circle.reconnect.enabled ? (
                  <>
                    <p className="mt-2 text-ink-2">Choose anyone you’d like to stay in touch with. Contact details are shared only if you both choose each other. Nobody sees a one-sided choice.</p>
                    {circle.reconnect.mutual.length ? (
                      <ul className="mt-4 grid gap-2">
                        {circle.reconnect.mutual.map((m) => (
                          <li key={m.userId} className="rounded-control border-2 border-success bg-surface p-4">
                            <p className="font-semibold">{m.name}</p>
                            <p className="text-meta">
                              <a href={`mailto:${m.email}`} className="underline">
                                {m.email}
                              </a>
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-meta text-ink-2">No mutual choices yet.</p>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-ink-2">Reconnect is available to recorded attendees who have not opted out. If you travelled and this looks wrong, <Link href="/contact" className="underline">contact support</Link>.</p>
                )}
                {others.length === 0 ? <p className="mt-2 text-meta text-ink-2">Nobody else to choose yet.</p> : null}
              </section>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-editorial border border-rule bg-surface p-6">
              <h2 className="text-xl">What you share</h2>
              <p className="mt-1 text-meta text-ink-2">Everything here is opt-in. Your answers about what you hope for are never shown to anyone.</p>
              <div className="mt-4">
                {circle.myPreferences ? (
                  <PreferencesForm
                    bookingId={circle.booking.id}
                    initial={{
                      shareWelcomePreference: circle.myPreferences.shareWelcomePreference,
                      welcomePreferenceOptionId: circle.myPreferences.welcomePreferenceOptionId ?? (typeof circle.booking.quizSnapshot?.answers.q2 === "string" ? circle.booking.quizSnapshot.answers.q2 : null),
                      shareRotationPreference: circle.myPreferences.shareRotationPreference,
                      rotationPreferenceOptionId: circle.myPreferences.rotationPreferenceOptionId ?? (typeof circle.booking.quizSnapshot?.answers.q7 === "string" ? circle.booking.quizSnapshot.answers.q7 : null),
                      intro: circle.myPreferences.intro,
                      contactShareRevokedAt: circle.myPreferences.contactShareRevokedAt ? circle.myPreferences.contactShareRevokedAt.toISOString() : null,
                    }}
                  />
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      </Container>
    </Section>
  );
}
