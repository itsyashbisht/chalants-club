"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/client/api";
import { formatInr } from "@/lib/money";
import { formatIstDateTime } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

/** Keeps a pending booking page honest: re-checks the owner-scoped status with backoff and refreshes on change. */
export function StatusPoller({ bookingId, state, active }: { bookingId: string; state: string; active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let attempt = 0;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const { data } = await api<{ state: string; pendingCapture: boolean }>(`/api/bookings/${bookingId}`);
        if (data.state !== state) {
          router.refresh();
          return;
        }
      } catch {
        // keep polling
      }
      attempt += 1;
      timer = window.setTimeout(tick, Math.min(30_000, 3_000 * 2 ** Math.min(attempt, 3)));
    };
    timer = window.setTimeout(tick, 3_000);
    return () => window.clearTimeout(timer);
  }, [active, bookingId, state, router]);
  return null;
}

/** Hold countdown in IST with a manual refresh fallback. */
export function Countdown({ until, label }: { until: string; label: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  const remaining = Math.max(0, new Date(until).getTime() - now);
  const minutes = Math.ceil(remaining / 60_000);
  return (
    <p className="text-meta text-ink-2" aria-live="polite">
      {label} {formatIstDateTime(until)} ({minutes > 0 ? `about ${minutes} minute${minutes === 1 ? "" : "s"} left` : "ended"}).
    </p>
  );
}

type Quote = { quoteId: string; expiresAt: string; refundPaise: number; capturedPaise: number; rule: string; perPayment: Array<{ instalment: string; refundPaise: number }> };

/** Dated refund quote in exact rupees, then explicit confirmation, then commit by quote ID. */
export function CancelPanel({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ refundPaise: number } | null>(null);

  if (done) {
    return (
      <Notice tone="success" title="Booking cancelled">
        <p className="mt-1">Refund requested: {formatInr(done.refundPaise)} to your original payment{done.refundPaise > 0 ? "s" : ""}. Track it below.</p>
      </Notice>
    );
  }

  return (
    <div className="grid gap-4">
      {!quote ? (
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const { data } = await api<Quote>(`/api/bookings/${bookingId}/cancel-quote`, { body: {} });
              setQuote(data);
            } catch (err: unknown) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Calculating…" : "See my refund if I cancel now"}
        </Button>
      ) : (
        <div className="rounded-control border-2 border-error bg-surface p-5">
          <p className="font-semibold">If you cancel now</p>
          <p className="tabular mt-2 text-3xl font-bold">{formatInr(quote.refundPaise)}</p>
          <p className="text-meta text-ink-2">
            refunded of {formatInr(quote.capturedPaise)} collected. {quote.rule}
          </p>
          {quote.perPayment.filter((p) => p.refundPaise > 0).length > 1 ? (
            <ul className="mt-2 text-meta text-ink-2">
              {quote.perPayment
                .filter((p) => p.refundPaise > 0)
                .map((p) => (
                  <li key={p.instalment}>
                    {formatInr(p.refundPaise)} to the {p.instalment} payment
                  </li>
                ))}
            </ul>
          ) : null}
          <p className="mt-2 text-meta text-ink-2">Quote valid until {formatIstDateTime(quote.expiresAt)}. The seat is released immediately and cannot be reopened.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const { data } = await api<{ refundPaise: number }>(`/api/bookings/${bookingId}/cancel`, { body: { quoteId: quote.quoteId } });
                  setDone({ refundPaise: data.refundPaise });
                  router.refresh();
                } catch (err: unknown) {
                  setError(errorText(err));
                  setQuote(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Cancelling…" : "Yes, cancel my booking"}
            </Button>
            <Button variant="secondary" onClick={() => setQuote(null)} disabled={busy}>
              Keep my booking
            </Button>
          </div>
        </div>
      )}
      {error ? <Notice tone="error" live>{error}</Notice> : null}
    </div>
  );
}

/** Traveller requests a private review slot or leaves contact instructions. */
export function ReviewCallForm({ bookingId, requestedAt }: { bookingId: string; requestedAt: string | null }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  if (sent || requestedAt) {
    return (
      <Notice tone="success" title="Request received">
        <p className="mt-1">A reviewer will email you to confirm the slot{requestedAt ? ` (requested ${formatIstDateTime(requestedAt)})` : ""}. Need to change it? Send another request.</p>
        {requestedAt && !sent ? (
          <button type="button" className="mt-2 underline" onClick={() => setSent(false)}>
            Send a new request
          </button>
        ) : null}
      </Notice>
    );
  }
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api(`/api/bookings/${bookingId}/review-call`, { body: { note } });
          setSent(true);
          router.refresh();
        } catch (err: unknown) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="call-note" className="font-semibold">
        When suits you, and how should we reach you?
        <span className="mt-1 block text-meta font-normal text-ink-2">For example: “Weekday evenings after 7 pm, WhatsApp video on my registered number.” Seen by reviewers only.</span>
      </label>
      <textarea id="call-note" required minLength={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-28 rounded-control border-2 border-outline bg-surface px-4 py-3" />
      {error ? <Notice tone="error" live>{error}</Notice> : null}
      <Button type="submit" disabled={busy || note.trim().length < 3}>
        {busy ? "Sending…" : "Request a review slot"}
      </Button>
    </form>
  );
}
