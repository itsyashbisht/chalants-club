"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QUESTIONS, type Question } from "./questions";
import type { QuizDraft } from "./answers";
import { saveDraft, saveStep, useQuizDraft } from "./draft";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/field";

/**
 * One question per screen with visible progress, back/next and full-width tap choices.
 * Answers are restored from session storage on refresh; Q8 (private intent) stays in component memory only.
 */
export function QuizFlow() {
  const router = useRouter();
  const store = useQuizDraft();
  const draft = store?.draft ?? null;
  const step = Math.min(store?.step ?? 0, QUESTIONS.length - 1);
  const [intent, setIntent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorId = useId();

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  if (!draft) {
    return (
      <p className="py-12 text-center text-ink-2" aria-live="polite">
        Loading your questions…
      </p>
    );
  }

  const question = QUESTIONS[step];
  const total = QUESTIONS.length;

  const update = (patch: Partial<QuizDraft>) => {
    saveDraft({ ...draft, ...patch });
    setError(null);
  };

  const answered = (): boolean => {
    switch (question.id) {
      case "q1":
        return typeof draft.age === "number" && Number.isInteger(draft.age) && draft.age >= 18 && draft.age <= 99;
      case "q8":
        return intent !== null;
      case "q9":
        return Boolean(draft.passedAux) || Boolean(draft.track?.title && draft.track?.artist);
      default:
        return typeof draft[question.id] === "string";
    }
  };

  const goNext = () => {
    if (!answered()) {
      setError(question.id === "q1" ? "Enter your age in whole years. You must be 18 or older." : question.id === "q9" ? "Add a song and artist, or pass the aux." : "Choose one option to continue.");
      return;
    }
    if (step === total - 1) {
      saveStep(0);
      router.push("/quiz/result");
      return;
    }
    saveStep(step + 1);
  };

  const goBack = () => {
    saveStep(Math.max(0, step - 1));
    setError(null);
  };

  return (
    <div className="mx-auto w-full max-w-form">
      <p className="text-meta font-semibold uppercase tracking-wide text-ink-2" aria-live="polite">
        Question {step + 1} of {total}
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-tint" aria-hidden>
        <div className="h-full bg-action transition-[width] duration-150" style={{ width: `${((step + 1) / total) * 100}%` }} />
      </div>

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          goNext();
        }}
        noValidate
      >
        <QuestionScreen key={question.id} question={question} draft={draft} intent={intent} onIntent={setIntent} onChange={update} headingRef={headingRef} errorId={error ? errorId : undefined} />
        <FieldError id={errorId}>{error}</FieldError>
        <div className="mt-8 flex items-center justify-between gap-3">
          <Button type="button" variant="secondary" onClick={goBack} disabled={step === 0}>
            Back
          </Button>
          <Button type="submit">{step === total - 1 ? "See my matches" : "Next"}</Button>
        </div>
      </form>
    </div>
  );
}

function QuestionScreen({ question, draft, intent, onIntent, onChange, headingRef, errorId }: { question: Question; draft: QuizDraft; intent: string | null; onIntent: (v: string) => void; onChange: (patch: Partial<QuizDraft>) => void; headingRef: React.RefObject<HTMLHeadingElement | null>; errorId?: string }) {
  if (question.kind === "number") {
    const value = draft.age ?? "";
    return (
      <div>
        <h1 ref={headingRef} tabIndex={-1} className="text-section outline-none">
          {question.prompt}
        </h1>
        <p className="mt-3 text-ink-2">{question.help}</p>
        <div className="mt-6">
          <Label htmlFor="age">Age in whole years</Label>
          <Input id="age" name="age" type="number" inputMode="numeric" min={18} max={99} step={1} value={value} aria-describedby={errorId} onChange={(e) => onChange({ age: e.target.value === "" ? undefined : Number(e.target.value) })} className="max-w-40" />
          {typeof draft.age === "number" && draft.age < 18 ? <p className="mt-2 text-meta text-attention">Trips are for adults aged 18 and over. Each departure also has its own age range.</p> : null}
        </div>
      </div>
    );
  }

  if (question.kind === "song") {
    const passed = Boolean(draft.passedAux);
    return (
      <div>
        <h1 ref={headingRef} tabIndex={-1} className="text-section outline-none">
          {question.prompt}
        </h1>
        <p className="mt-3 text-ink-2">{question.help}</p>
        <div className="mt-6 grid gap-4">
          <div>
            <Label htmlFor="track-title">Song</Label>
            <Input id="track-title" value={draft.track?.title ?? ""} disabled={passed} maxLength={120} aria-describedby={errorId} onChange={(e) => onChange({ track: { title: e.target.value, artist: draft.track?.artist ?? "" }, passedAux: false })} />
          </div>
          <div>
            <Label htmlFor="track-artist">Artist</Label>
            <Input id="track-artist" value={draft.track?.artist ?? ""} disabled={passed} maxLength={120} onChange={(e) => onChange({ track: { title: draft.track?.title ?? "", artist: e.target.value }, passedAux: false })} />
          </div>
          <Button type="button" variant={passed ? "primary" : "secondary"} aria-pressed={passed} onClick={() => onChange({ passedAux: !passed, track: passed ? draft.track : null })}>
            {passed ? "Passing the aux ✓" : "Pass the aux"}
          </Button>
        </div>
      </div>
    );
  }

  const isPrivate = question.id === "q8";
  const selected = isPrivate ? intent : draft[question.id as Exclude<typeof question.id, "q8">];
  return (
    <fieldset aria-describedby={errorId}>
      <legend className="w-full">
        <h1 ref={headingRef} tabIndex={-1} className="text-section outline-none">
          {question.prompt}
        </h1>
        {question.help ? <p className="mt-3 text-ink-2">{question.help}</p> : null}
      </legend>
      <div className="mt-6 grid gap-3">
        {question.options.map((option) => {
          const checked = selected === option.id;
          const id = `${question.id}-${option.id}`;
          return (
            <label key={option.id} htmlFor={id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-card border-2 px-4 py-3 transition-colors duration-150 ${checked ? "border-ink bg-tint" : "border-outline bg-surface hover:bg-tint/60"}`}>
              <input id={id} type="radio" name={question.id} value={option.id} checked={checked} onChange={() => (isPrivate ? onIntent(option.id) : onChange({ [question.id]: option.id }))} className="size-5 accent-action" />
              <span className="flex-1 font-semibold">{option.label}</span>
              <span aria-hidden className={`text-lg ${checked ? "opacity-100" : "opacity-0"}`}>
                ✓
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
