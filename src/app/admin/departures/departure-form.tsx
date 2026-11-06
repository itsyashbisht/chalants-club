"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, errorText } from "@/lib/client/api";
import { QUESTIONS } from "@/features/quiz/questions";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export type DepartureFormValues = {
  tripId: string;
  hostId: string;
  policyVersionId: string;
  startDate: string;
  endDate: string;
  salesCloseAt: string;
  capacity: number;
  minAge: number;
  maxAge: number;
  totalPaise: number;
  depositBps: number;
  holdMinutes: number;
  reviewHours: number;
  balanceWindowHours: number;
  taxesNote: string;
  tags: Array<{ question: "q3" | "q4" | "q5" | "q6"; optionId: string; fact: string }>;
};

type Option = { id: string; label: string };

const scoredQuestions = QUESTIONS.filter((q) => q.kind === "choice" && q.scoring === "scored");

/** Operator form for creating or editing a departure. Server validation errors are surfaced per field. */
export function DepartureForm({ mode, departureId, expectedVersion, initial, trips, hosts, policies }: { mode: "create" | "edit"; departureId?: string; expectedVersion?: number; initial: DepartureFormValues; trips: Option[]; hosts: Option[]; policies: Option[] }) {
  const router = useRouter();
  const [values, setValues] = useState<DepartureFormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof DepartureFormValues>(key: K, value: DepartureFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const num = (key: keyof DepartureFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => set(key, Number(e.target.value) as never);

  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setFieldErrors({});
        try {
          const payload = { ...values, salesCloseAt: new Date(values.salesCloseAt).toISOString() };
          if (mode === "create") {
            const { data } = await api<{ id: string }>("/api/admin/departures", { body: payload });
            router.push(`/admin/departures/${data.id}`);
          } else {
            await api(`/api/admin/departures/${departureId}`, { method: "PATCH", body: { action: "edit", expectedVersion, data: payload } });
            router.refresh();
          }
        } catch (err: unknown) {
          if (err instanceof ApiError && Array.isArray(err.details)) {
            setFieldErrors(Object.fromEntries((err.details as Array<{ path: string; message: string }>).map((d) => [d.path, d.message])));
          }
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="tripId">Trip</Label>
          <Select id="tripId" value={values.tripId} onChange={(e) => set("tripId", e.target.value)}>
            <option value="">Choose…</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="hostId">Host</Label>
          <Select id="hostId" value={values.hostId} onChange={(e) => set("hostId", e.target.value)}>
            <option value="">Choose…</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="policyVersionId">Cancellation policy</Label>
          <Select id="policyVersionId" value={values.policyVersionId} onChange={(e) => set("policyVersionId", e.target.value)}>
            <option value="">Choose…</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="startDate">Start date</Label>
          <Input id="startDate" type="date" value={values.startDate} onChange={(e) => set("startDate", e.target.value)} invalid={Boolean(fieldErrors.startDate)} />
          <FieldError id="e-startDate">{fieldErrors.startDate}</FieldError>
        </div>
        <div>
          <Label htmlFor="endDate">End date</Label>
          <Input id="endDate" type="date" value={values.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="salesCloseAt" hint="Local time; must leave room for review and balance collection.">
            Sales close
          </Label>
          <Input id="salesCloseAt" type="datetime-local" value={values.salesCloseAt} onChange={(e) => set("salesCloseAt", e.target.value)} invalid={Boolean(fieldErrors.salesCloseAt)} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <Label htmlFor="capacity">Capacity</Label>
          <Input id="capacity" type="number" min={1} value={values.capacity} onChange={num("capacity")} />
        </div>
        <div>
          <Label htmlFor="minAge">Min age</Label>
          <Input id="minAge" type="number" min={18} value={values.minAge} onChange={num("minAge")} />
        </div>
        <div>
          <Label htmlFor="maxAge">Max age</Label>
          <Input id="maxAge" type="number" min={18} value={values.maxAge} onChange={num("maxAge")} />
        </div>
        <div>
          <Label htmlFor="depositBps">Deposit (basis points)</Label>
          <Input id="depositBps" type="number" min={1} max={9999} value={values.depositBps} onChange={num("depositBps")} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <Label htmlFor="totalPaise" hint="Integer paise, e.g. 1200000 = ₹12,000">
            Total (paise)
          </Label>
          <Input id="totalPaise" type="number" min={1} value={values.totalPaise} onChange={num("totalPaise")} />
        </div>
        <div>
          <Label htmlFor="holdMinutes">Hold (minutes)</Label>
          <Input id="holdMinutes" type="number" min={5} value={values.holdMinutes} onChange={num("holdMinutes")} />
        </div>
        <div>
          <Label htmlFor="reviewHours">Review target (hours)</Label>
          <Input id="reviewHours" type="number" min={1} value={values.reviewHours} onChange={num("reviewHours")} />
        </div>
        <div>
          <Label htmlFor="balanceWindowHours">Balance window (hours)</Label>
          <Input id="balanceWindowHours" type="number" min={1} value={values.balanceWindowHours} onChange={num("balanceWindowHours")} />
        </div>
      </div>
      <div>
        <Label htmlFor="taxesNote">Taxes note</Label>
        <Input id="taxesNote" value={values.taxesNote} onChange={(e) => set("taxesNote", e.target.value)} />
      </div>
      <fieldset className="rounded-control border border-rule p-4">
        <legend className="px-1 font-semibold">Matchable itinerary facts</legend>
        <p className="text-meta text-ink-2">Each tag pairs a quiz option with the real scheduled activity that backs it. Only tagged options earn match points.</p>
        <div className="mt-3 grid gap-3">
          {values.tags.map((tag, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto]">
              <Select aria-label="Question" value={tag.question} onChange={(e) => set("tags", values.tags.map((t, j) => (j === i ? { ...t, question: e.target.value as typeof t.question, optionId: "" } : t)))}>
                {scoredQuestions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.id.toUpperCase()}
                  </option>
                ))}
              </Select>
              <Select aria-label="Option" value={tag.optionId} onChange={(e) => set("tags", values.tags.map((t, j) => (j === i ? { ...t, optionId: e.target.value } : t)))}>
                <option value="">Option…</option>
                {(scoredQuestions.find((q) => q.id === tag.question) as { options?: Option[] } | undefined)?.options?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Textarea aria-label="Fact" className="min-h-11" value={tag.fact} onChange={(e) => set("tags", values.tags.map((t, j) => (j === i ? { ...t, fact: e.target.value } : t)))} />
              <Button type="button" variant="ghost" onClick={() => set("tags", values.tags.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={() => set("tags", [...values.tags, { question: "q3", optionId: "", fact: "" }])}>
            Add fact
          </Button>
        </div>
      </fieldset>
      {error ? <Notice tone="error" live>{error}</Notice> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : mode === "create" ? "Create draft departure" : "Save changes"}
      </Button>
    </form>
  );
}
