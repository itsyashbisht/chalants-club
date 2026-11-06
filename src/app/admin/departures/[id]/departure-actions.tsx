"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

type Action = "publish" | "close" | "cancel" | "complete";

/** Status transitions with explicit confirmation for cancellation (refunds every active booking). */
export function DepartureActions({ departureId, status, version, allocated }: { departureId: string; status: string; version: number; allocated: number }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const available: Action[] = status === "draft" ? ["publish", "cancel"] : status === "published" ? ["close", "cancel", "complete"] : status === "closed" ? ["publish", "complete", "cancel"] : [];
  const run = async (action: Action) => {
    if (action === "cancel" && pending !== "cancel") {
      setPending("cancel");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api<{ status: string; affectedBookings: number }>(`/api/admin/departures/${departureId}`, { method: "PATCH", body: { action, reason: reason || `${action} by operator`, expectedVersion: version } });
      setMsg({ tone: "success", text: `Now ${data.status}. ${data.affectedBookings} booking(s) affected.` });
      setPending(null);
      router.refresh();
    } catch (err: unknown) {
      setMsg({ tone: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-3">
      <div>
        <Label htmlFor="action-reason">Reason (audited)</Label>
        <Input id="action-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {available.map((a) => (
          <Button key={a} variant={a === "cancel" ? "danger" : "secondary"} disabled={busy} onClick={() => run(a)}>
            {a === "cancel" && pending === "cancel" ? `Confirm cancel (${allocated} active booking${allocated === 1 ? "" : "s"} refunded)` : a[0].toUpperCase() + a.slice(1)}
          </Button>
        ))}
        {available.length === 0 ? <span className="text-meta text-ink-2">No transitions from {status}.</span> : null}
      </div>
      {msg ? <Notice tone={msg.tone} live={msg.tone === "error"}>{msg.text}</Notice> : null}
    </div>
  );
}

export function RosterControls({ departureId, prefId, attended, bookingId, hasTrack, trackApproved }: { departureId: string; prefId: string | null; attended: boolean; bookingId: string; hasTrack: boolean; trackApproved: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api(`/api/admin/departures/${departureId}/roster`, { body });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-wrap gap-2">
      {prefId ? (
        <Button variant="secondary" className="min-h-9 px-3 py-1 text-meta" disabled={busy} onClick={() => call({ action: "attendance", prefId, attended: !attended })}>
          {attended ? "Attended ✓" : "Mark attended"}
        </Button>
      ) : null}
      {hasTrack ? (
        <Button variant="secondary" className="min-h-9 px-3 py-1 text-meta" disabled={busy} onClick={() => call({ action: "track", bookingId, approved: !trackApproved })}>
          {trackApproved ? "Track approved ✓" : "Approve track"}
        </Button>
      ) : null}
    </span>
  );
}
