"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, errorText } from "@/lib/client/api";
import { formatDateRange } from "@/lib/time";
import { draftToMatchAnswers } from "./answers";
import { useQuizDraft } from "./draft";
import { DepartureCard, type DepartureCardData } from "@/components/ui/departure-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Checkbox } from "@/components/ui/field";

type Ranked = { id: string; points: number; reasons: Array<{ preference: string; fact: string }>; soldOut: boolean; departure: DepartureCardData };
type MatchResponse = { version: string; eligible: Ranked[]; soldOut: Ranked[]; noneReason: string | null };

/** Regenerates the result from validated answers on every visit; never shows a compatibility score. */
export function ResultView({ signedIn }: { signedIn: boolean }) {
  const store = useQuizDraft();
  const answers = store ? draftToMatchAnswers(store.draft) : undefined;
  const answersKey = answers ? JSON.stringify(answers) : null;
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [trackConsent, setTrackConsent] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  useEffect(() => {
    if (!answersKey) return;
    let cancelled = false;
    api<MatchResponse>("/api/quiz/match", { body: JSON.parse(answersKey) })
      .then((r) => {
        if (!cancelled) setResult(r.data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [answersKey]);

  if (answers === undefined) return <p className="py-12 text-center text-ink-2">Working out your matches…</p>;
  if (answers === null) {
    return (
      <Notice tone="attention" title="Finish the nine questions first">
        <p className="mt-1">
          Your answers are kept in this tab while you play. <Link href="/quiz" className="underline">Start the quiz</Link> or <Link href="/trips" className="underline">browse all trips</Link>.
        </p>
      </Notice>
    );
  }
  if (error) return <Notice tone="error" title="We couldn’t load your matches" live>{error}</Notice>;
  if (!result) return <p className="py-12 text-center text-ink-2">Working out your matches…</p>;

  const top = result.eligible[0] ?? result.soldOut[0] ?? null;
  const track = answers.track;

  const share = async () => {
    if (!top) return;
    const url = `${window.location.origin}/trips/${top.departure.trip.slug}?departure=${top.departure.id}`;
    const text = `${top.departure.trip.destination} · ${top.departure.trip.title} · ${formatDateRange(top.departure.startDate, top.departure.endDate)}`;
    try {
      if (navigator.share) await navigator.share({ title: top.departure.trip.destination, text, url });
      else {
        await navigator.clipboard.writeText(url);
        setShareNote("Link copied. Only the public trip page is shared, never your answers.");
      }
    } catch {
      setShareNote("Sharing was cancelled.");
    }
  };

  const save = async () => {
    setSaveState("saving");
    try {
      await api("/api/quiz/save", { body: { answers, trackConsent } });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[5fr_7fr]">
      <div>
        <div className="rounded-editorial bg-poster p-8 text-ink md:p-10" aria-label="Your result poster">
          <p className="text-meta font-semibold uppercase tracking-widest">Your travel circle</p>
          <p className="mt-4 font-display text-5xl font-bold leading-[0.95] md:text-6xl">{top ? top.departure.trip.destination : "Not yet"}</p>
          {top ? <p className="mt-4 text-lg font-semibold">{formatDateRange(top.departure.startDate, top.departure.endDate)}</p> : null}
          {track ? <p className="mt-6 border-t border-ink/30 pt-4 text-meta font-semibold uppercase tracking-wide">First song on the bus: {track.title} · {track.artist}</p> : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {top ? (
            <Button variant="secondary" onClick={share}>
              Share poster
            </Button>
          ) : null}
          <ButtonLink
            href="/quiz"
            variant="secondary"
          >
            Change answers
          </ButtonLink>
          <ButtonLink href="/trips" variant="ghost">
            Browse all trips
          </ButtonLink>
        </div>
        {shareNote ? <p className="mt-2 text-meta text-ink-2" aria-live="polite">{shareNote}</p> : null}
        <div className="mt-6 rounded-control border border-rule bg-surface p-4 text-meta">
          {signedIn ? (
            saveState === "saved" ? (
              <p className="font-semibold text-success">Answers saved to your account.</p>
            ) : (
              <>
                <p className="font-semibold">Save these answers to your account</p>
                {track ? <Checkbox id="track-consent" label="You may add my song to the circle playlist if I book" checked={trackConsent} onChange={(e) => setTrackConsent(e.target.checked)} /> : null}
                <Button className="mt-2" onClick={save} disabled={saveState === "saving"}>
                  {saveState === "saving" ? "Saving…" : "Save my answers"}
                </Button>
                {saveState === "error" ? <p className="mt-2 text-error">Could not save. Try again.</p> : null}
              </>
            )
          ) : (
            <p>
              <Link href={`/sign-in?redirect_url=${encodeURIComponent("/quiz/result")}`} className="font-semibold underline">
                Sign in
              </Link>{" "}
              to save your answers. They stay in this tab meanwhile.
            </p>
          )}
        </div>
      </div>

      <div>
        {result.noneReason ? (
          <Notice tone="attention" title="No eligible departure right now">
            <p className="mt-1">{result.noneReason}</p>
          </Notice>
        ) : null}
        {result.eligible.length ? (
          <>
            <h2 className="text-section">Departures that fit</h2>
            <p className="mt-2 text-ink-2">Ranked by how many of your pace, activity, structure and evening answers match what is actually scheduled.</p>
            <ol className="mt-6 grid gap-6 md:grid-cols-2">
              {result.eligible.map((r) => (
                <li key={r.id}>
                  <DepartureCard d={r.departure} reasons={r.reasons} />
                </li>
              ))}
            </ol>
          </>
        ) : null}
        {result.soldOut.length ? (
          <div className="mt-10">
            <h2 className="text-xl">Full right now · waitlist</h2>
            <ol className="mt-4 grid gap-6 md:grid-cols-2">
              {result.soldOut.map((r) => (
                <li key={r.id}>
                  <DepartureCard d={r.departure} reasons={r.reasons} />
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}
