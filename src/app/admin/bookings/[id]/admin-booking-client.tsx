"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

const REASONS: Record<string, Array<[string, string]>> = {
  approved: [["identity_confirmed", "Identity and age confirmed on call"]],
  info_requested: [
    ["call_missed", "Call missed"],
    ["document_unclear", "Document not clearly visible"],
    ["needs_reschedule", "Needs reschedule"],
    ["other", "Other"],
  ],
  rejected: [
    ["identity_not_confirmed", "Identity could not be confirmed"],
    ["age_ineligible", "Age outside the departure range"],
    ["conduct_policy", "Conduct policy"],
    ["other", "Other"],
  ],
};

export function DecisionForm({ reviewId, revision, bookingState }: { reviewId: string; revision: number; bookingState: string }) {
  const router = useRouter();
  const [decision, setDecision] = useState<"approved" | "info_requested" | "rejected">("approved");
  const [reasonCode, setReasonCode] = useState(REASONS.approved[0][0]);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  if (bookingState !== "UNDER_REVIEW") return <Notice tone="neutral" title="No decision pending">Booking is {bookingState}.</Notice>;
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (decision === "rejected" && !confirm) {
          setConfirm(true);
          return;
        }
        setBusy(true);
        setMsg(null);
        try {
          const { data } = await api<{ bookingState: string }>(`/api/admin/reviews/${reviewId}/decision`, { body: { expectedRevision: revision, decision, reasonCode, note: note || undefined } });
          setMsg({ tone: "success", text: `Recorded. Booking is now ${data.bookingState}.` });
          router.refresh();
        } catch (err: unknown) {
          setMsg({ tone: "error", text: errorText(err) });
        } finally {
          setBusy(false);
          setConfirm(false);
        }
      }}
    >
      <div>
        <Label htmlFor="decision">Decision</Label>
        <Select
          id="decision"
          value={decision}
          onChange={(e) => {
            const d = e.target.value as typeof decision;
            setDecision(d);
            setReasonCode(REASONS[d][0][0]);
            setConfirm(false);
          }}
        >
          <option value="approved">Approve · opens the balance window once</option>
          <option value="info_requested">Request follow-up · seat stays held</option>
          <option value="rejected">Reject · releases the seat, full refund</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="reason">Reason code</Label>
        <Select id="reason" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
          {REASONS[decision].map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="note" hint="Outcome only. Never document numbers or images.">
          Note (restricted)
        </Label>
        <Textarea id="note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className="min-h-24" />
      </div>
      {confirm ? <Notice tone="error" title="Confirm rejection">This releases the seat and queues a full refund of money collected. Submit again to confirm.</Notice> : null}
      {msg ? <Notice tone={msg.tone} live={msg.tone === "error"}>{msg.text}</Notice> : null}
      <Button type="submit" variant={decision === "rejected" ? "danger" : "primary"} disabled={busy}>
        {busy ? "Saving…" : confirm ? "Confirm rejection" : "Record decision"}
      </Button>
    </form>
  );
}

export function CallStatusButtons({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = async (status: "scheduled" | "done" | "inconclusive") => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/reviews/${reviewId}/call`, { body: { status } });
      router.refresh();
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" disabled={busy} onClick={() => set("scheduled")}>
        Mark scheduled
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => set("inconclusive")}>
        Mark inconclusive
      </Button>
      {error ? <span className="text-meta text-error">{error}</span> : null}
    </div>
  );
}

export function OperatorCancel({ bookingId, active }: { bookingId: string; active: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  if (!active) return null;
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!confirm) {
          setConfirm(true);
          return;
        }
        setBusy(true);
        try {
          const { data } = await api<{ refundPaise: number }>(`/api/admin/bookings/${bookingId}/cancel`, { body: { reason } });
          setMsg({ tone: "success", text: `Cancelled. Refund queued: ₹${(data.refundPaise / 100).toLocaleString("en-IN")}.` });
          router.refresh();
        } catch (err: unknown) {
          setMsg({ tone: "error", text: errorText(err) });
        } finally {
          setBusy(false);
          setConfirm(false);
        }
      }}
    >
      <Label htmlFor="cancel-reason">Operator cancellation reason</Label>
      <Textarea id="cancel-reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-20" />
      {confirm ? <Notice tone="error" title="Confirm">Full refund of every captured instalment. Submit again to confirm.</Notice> : null}
      {msg ? <Notice tone={msg.tone} live={msg.tone === "error"}>{msg.text}</Notice> : null}
      <Button type="submit" variant="danger" disabled={busy || reason.trim().length < 3}>
        {confirm ? "Confirm cancellation" : "Cancel booking (full refund)"}
      </Button>
    </form>
  );
}
