"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, errorText } from "@/lib/client/api";
import { formatInr } from "@/lib/money";
import { useQuizDraft } from "@/features/quiz/draft";
import { draftToMatchAnswers } from "@/features/quiz/answers";
import { Button } from "@/components/ui/button";
import { Checkbox, FieldError, Input, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export type BookingFormProps = {
  departureId: string;
  quoteVersion: number;
  policyVersionId: string;
  minAge: number;
  maxAge: number;
  depositPaise: number;
  holdMinutes: number;
  policySummary: string;
  tripSlug: string;
};

/**
 * Eligibility, self-attestation, price review and policy acceptance. Age and answers are prefilled from the
 * quiz draft in this tab when present. Money is never sent; the server re-reads the quote under lock.
 */
export function BookingForm(props: BookingFormProps) {
  const router = useRouter();
  const store = useQuizDraft();
  const quiz = store ? draftToMatchAnswers(store.draft) : null;
  const draftAge = quiz ? String(quiz.age) : typeof store?.draft.age === "number" ? String(store.draft.age) : "";
  const [ageInput, setAgeInput] = useState<string | null>(null);
  const age = ageInput ?? draftAge;
  const setAge = setAgeInput;
  const [single, setSingle] = useState(false);
  const [conduct, setConduct] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const errorId = useId();

  /** Stable per departure and tab so a retry or double-click replays the same reservation. */
  const operationKey = () => {
    const storageKey = `chalants.booking.op.${props.departureId}`;
    try {
      const existing = window.sessionStorage.getItem(storageKey);
      const key = existing ?? crypto.randomUUID();
      window.sessionStorage.setItem(storageKey, key);
      return key;
    } catch {
      return crypto.randomUUID();
    }
  };

  const ageNumber = Number(age);
  const ageValid = Number.isInteger(ageNumber) && ageNumber >= 18 && ageNumber <= 99;
  const ageEligible = ageValid && ageNumber >= props.minAge && ageNumber <= props.maxAge;
  const canSubmit = ageEligible && single && conduct && policy && !busy;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api<{ booking: { id: string } }>("/api/bookings", {
        body: {
          departureId: props.departureId,
          quoteVersion: props.quoteVersion,
          policyVersionId: props.policyVersionId,
          age: ageNumber,
          quiz: quiz ? { ...quiz, age: ageNumber } : null,
          attestations: { single: true, conduct: true, policy: true },
          clientOperationKey: operationKey(),
        },
      });
      router.push(`/account/bookings/${data.booking.id}`);
    } catch (err: unknown) {
      setError({ code: err instanceof ApiError ? err.code : "ERROR", message: errorText(err) });
      setBusy(false);
    }
  };

  return (
    <form
      className="grid gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) void submit();
      }}
    >
      {!quiz ? (
        <Notice tone="neutral" title="Haven’t played the nine questions?">
          <p className="mt-1">
            It’s optional for booking. <Link href="/quiz" className="underline">Play first</Link> and your answers will be attached, or continue with your age below.
          </p>
        </Notice>
      ) : (
        <Notice tone="success" title="Your quiz answers will be attached">
          <p className="mt-1">Your private answer about what you hope for is not included.</p>
        </Notice>
      )}

      <div>
        <Label htmlFor="age" hint={`This departure is for ages ${props.minAge}–${props.maxAge}.`}>
          Your age
        </Label>
        <Input id="age" type="number" inputMode="numeric" min={18} max={99} value={age} onChange={(e) => setAge(e.target.value)} className="max-w-40" invalid={age !== "" && !ageEligible} aria-describedby="age-help" />
        <p id="age-help" className={`mt-2 text-meta ${age !== "" && !ageEligible ? "text-error" : "text-ink-2"}`} aria-live="polite">
          {age === "" ? "Whole years." : !ageValid ? "Enter a whole number, 18 or over." : !ageEligible ? "Outside the age range for this departure. Browse other dates or join the waitlist for one that fits." : "You’re eligible for this departure."}
        </p>
      </div>

      <fieldset className="grid gap-1 rounded-control border border-rule bg-surface p-4">
        <legend className="px-1 font-semibold">Before you reserve</legend>
        <Checkbox id="att-single" label="I confirm I am single and travelling as one adult." checked={single} onChange={(e) => setSingle(e.target.checked)} />
        <Checkbox
          id="att-conduct"
          label={
            <>
              I accept the <Link href="/safety" className="underline">conduct rules</Link> and understand that identity and age are verified on a private call after the deposit.
            </>
          }
          checked={conduct}
          onChange={(e) => setConduct(e.target.checked)}
        />
        <Checkbox
          id="att-policy"
          label={
            <>
              I accept the <Link href="/terms" className="underline">terms</Link> and this departure’s cancellation policy: {props.policySummary}
            </>
          }
          checked={policy}
          onChange={(e) => setPolicy(e.target.checked)}
        />
      </fieldset>

      <p className="text-meta text-ink-2">Reserving holds one seat for {props.holdMinutes} minutes while you pay the {formatInr(props.depositPaise)} deposit. A payment counts only if it is captured while the hold is active; anything that lands later is refunded in full. Timings are shown in IST.</p>

      {error ? (
        <div>
          <Notice tone="error" title={error.code === "SOLD_OUT" ? "The last seat was just taken" : error.code === "QUOTE_CHANGED" ? "The price or terms changed" : "We couldn’t reserve a seat"} live>
            <p className="mt-1">{error.message}</p>
            {error.code === "SOLD_OUT" ? (
              <p className="mt-2">
                <Link href={`/trips/${props.tripSlug}?departure=${props.departureId}`} className="underline">Join the waitlist</Link> from the trip page.
              </p>
            ) : null}
            {error.code === "QUOTE_CHANGED" ? (
              <p className="mt-2">
                <button type="button" className="underline" onClick={() => router.refresh()}>
                  Review the updated quote
                </button>
              </p>
            ) : null}
          </Notice>
        </div>
      ) : null}
      <FieldError id={errorId} />
      <Button type="submit" size="lg" disabled={!canSubmit}>
        {busy ? "Reserving…" : `Reserve and pay ${formatInr(props.depositPaise)} deposit`}
      </Button>
    </form>
  );
}
