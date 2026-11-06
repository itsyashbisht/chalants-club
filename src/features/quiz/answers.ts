import { z } from "zod";
import { QUIZ_VERSION, isValidOption } from "./questions";

/** Answers that may be sent to the server. Q8 (private intent) is intentionally absent from this schema. */
export const matchAnswersSchema = z.object({
  version: z.literal(QUIZ_VERSION),
  age: z.number().int().min(18, "You must be 18 or older to travel with us.").max(99),
  q2: z.string().refine((v) => isValidOption("q2", v), "Unknown option").optional(),
  q3: z.string().refine((v) => isValidOption("q3", v), "Unknown option"),
  q4: z.string().refine((v) => isValidOption("q4", v), "Unknown option"),
  q5: z.string().refine((v) => isValidOption("q5", v), "Unknown option"),
  q6: z.string().refine((v) => isValidOption("q6", v), "Unknown option"),
  q7: z.string().refine((v) => isValidOption("q7", v), "Unknown option").optional(),
  track: z
    .object({ title: z.string().trim().min(1).max(120), artist: z.string().trim().min(1).max(120) })
    .nullable()
    .optional(),
});

export type MatchAnswers = z.infer<typeof matchAnswersSchema>;

/** Guest draft kept in the browser. `intent` (Q8) lives in component memory only; it is typed here so the client can hold it. */
export type QuizDraft = {
  version: typeof QUIZ_VERSION;
  age?: number;
  q2?: string;
  q3?: string;
  q4?: string;
  q5?: string;
  q6?: string;
  q7?: string;
  track?: { title: string; artist: string } | null;
  passedAux?: boolean;
};

export function draftToMatchAnswers(draft: QuizDraft): MatchAnswers | null {
  const parsed = matchAnswersSchema.safeParse({
    version: draft.version,
    age: draft.age,
    q2: draft.q2,
    q3: draft.q3,
    q4: draft.q4,
    q5: draft.q5,
    q6: draft.q6,
    q7: draft.q7,
    track: draft.track ?? null,
  });
  return parsed.success ? parsed.data : null;
}
