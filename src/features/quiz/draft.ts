"use client";

import { useSyncExternalStore } from "react";
import { QUIZ_VERSION } from "./questions";
import type { QuizDraft } from "./answers";

const DRAFT_KEY = "chalants.quiz.v1";
const STEP_KEY = "chalants.quiz.step";

type Snapshot = { draft: QuizDraft; step: number };

let snapshot: Snapshot | null = null;
const listeners = new Set<() => void>();

function read(): Snapshot {
  let draft: QuizDraft = { version: QUIZ_VERSION };
  let step = 0;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as QuizDraft;
      if (parsed.version === QUIZ_VERSION) draft = parsed;
    }
    const n = Number(window.sessionStorage.getItem(STEP_KEY) ?? "0");
    step = Number.isInteger(n) && n >= 0 ? n : 0;
  } catch {
    // Storage unavailable (private mode): the quiz still works for the current screen.
  }
  return { draft, step };
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Snapshot {
  if (!snapshot) snapshot = read();
  return snapshot;
}

function getServerSnapshot(): Snapshot | null {
  return null;
}

/**
 * Guest answers live in tab-scoped session storage and are exposed as an external store so components can
 * read them after hydration without effects. Private intent (Q8) is never written here.
 * Returns null during server rendering and the first client render.
 */
export function useQuizDraft(): Snapshot | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function loadDraft(): QuizDraft {
  return getSnapshot().draft;
}

export function saveDraft(draft: QuizDraft) {
  const next: QuizDraft = { ...draft, version: QUIZ_VERSION };
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  snapshot = { draft: next, step: getSnapshot().step };
  emit();
}

export function saveStep(step: number) {
  try {
    window.sessionStorage.setItem(STEP_KEY, String(step));
  } catch {
    // ignore
  }
  snapshot = { draft: getSnapshot().draft, step };
  emit();
}

export function clearDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
    window.sessionStorage.removeItem(STEP_KEY);
  } catch {
    // ignore
  }
  snapshot = { draft: { version: QUIZ_VERSION }, step: 0 };
  emit();
}
