"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/client/api";
import { getQuestion } from "@/features/quiz/questions";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

type Prefs = { shareWelcomePreference: boolean; welcomePreferenceOptionId: string | null; shareRotationPreference: boolean; rotationPreferenceOptionId: string | null; intro: string | null; contactShareRevokedAt: string | null };

export function PreferencesForm({ bookingId, initial }: { bookingId: string; initial: Prefs }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const q2 = getQuestion("q2");
  const q7 = getQuestion("q7");
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          await api(`/api/circle/preferences`, { body: { bookingId, ...prefs, revokeContactShare: Boolean(prefs.contactShareRevokedAt) } });
          setMsg({ tone: "success", text: "Saved." });
          router.refresh();
        } catch (err: unknown) {
          setMsg({ tone: "error", text: errorText(err) });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <Label htmlFor="intro" hint="Shown to confirmed travellers in this circle only.">
          A line about you (optional)
        </Label>
        <Textarea id="intro" maxLength={280} value={prefs.intro ?? ""} onChange={(e) => setPrefs({ ...prefs, intro: e.target.value })} className="min-h-24" />
      </div>
      <Checkbox id="share-welcome" label="Share my first-hello preference with the host" checked={prefs.shareWelcomePreference} onChange={(e) => setPrefs({ ...prefs, shareWelcomePreference: e.target.checked })} />
      {prefs.shareWelcomePreference && q2.kind === "choice" ? (
        <Select aria-label="First hello preference" value={prefs.welcomePreferenceOptionId ?? ""} onChange={(e) => setPrefs({ ...prefs, welcomePreferenceOptionId: e.target.value || null })}>
          <option value="">Choose…</option>
          {q2.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : null}
      <Checkbox id="share-rotation" label="Share my day-two mixing preference with the host" checked={prefs.shareRotationPreference} onChange={(e) => setPrefs({ ...prefs, shareRotationPreference: e.target.checked })} />
      {prefs.shareRotationPreference && q7.kind === "choice" ? (
        <Select aria-label="Day two preference" value={prefs.rotationPreferenceOptionId ?? ""} onChange={(e) => setPrefs({ ...prefs, rotationPreferenceOptionId: e.target.value || null })}>
          <option value="">Choose…</option>
          {q7.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : null}
      <Checkbox id="revoke" label="Opt out of post-trip reconnect (my contact is never shared)" checked={Boolean(prefs.contactShareRevokedAt)} onChange={(e) => setPrefs({ ...prefs, contactShareRevokedAt: e.target.checked ? new Date().toISOString() : null })} />
      {msg ? <Notice tone={msg.tone} live={msg.tone === "error"}>{msg.text}</Notice> : null}
      <Button type="submit" variant="secondary" disabled={busy}>
        {busy ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}

export function TrackForm({ bookingId, departureId, initial }: { bookingId: string; departureId: string; initial: { title: string; artist: string } | null }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [artist, setArtist] = useState(initial?.artist ?? "");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!consent) {
          setMsg({ tone: "error", text: "Tick the consent box to add your song." });
          return;
        }
        setBusy(true);
        setMsg(null);
        try {
          await api(`/api/circle/${departureId}/tracks`, { body: { bookingId, title, artist, consent: true } });
          setMsg({ tone: "success", text: "Suggested. The host approves tracks before they appear to others." });
          router.refresh();
        } catch (err: unknown) {
          setMsg({ tone: "error", text: errorText(err) });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="tr-title">Song</Label>
          <Input id="tr-title" value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="tr-artist">Artist</Label>
          <Input id="tr-artist" value={artist} maxLength={120} required onChange={(e) => setArtist(e.target.value)} />
        </div>
      </div>
      <Checkbox id="tr-consent" label="Add this to the circle playlist for this departure." checked={consent} onChange={(e) => setConsent(e.target.checked)} />
      {msg ? <Notice tone={msg.tone} live={msg.tone === "error"}>{msg.text}</Notice> : null}
      <Button type="submit" variant="secondary" disabled={busy}>
        {busy ? "Adding…" : "Suggest my first song"}
      </Button>
    </form>
  );
}

export function ReconnectButton({ departureId, toUserId, chosen }: { departureId: string; toUserId: string; chosen: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(chosen);
  const [mutual, setMutual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) return <span className="text-meta font-semibold text-success">{mutual ? "Mutual · contact shared below" : "Chosen · shared only if they choose you too"}</span>;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { data } = await api<{ mutual: boolean }>(`/api/circle/${departureId}/reconnect`, { body: { toUserId } });
            setMutual(data.mutual);
            setDone(true);
            router.refresh();
          } catch (err: unknown) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "…" : "Reconnect"}
      </Button>
      {error ? <span className="text-meta text-error">{error}</span> : null}
    </span>
  );
}
