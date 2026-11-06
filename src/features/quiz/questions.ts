/** Versioned quiz definition with stable option IDs. Display wording may change; IDs must not. */

export const QUIZ_VERSION = "v1" as const;

export type QuestionId = "q1" | "q2" | "q3" | "q4" | "q5" | "q6" | "q7" | "q8" | "q9";

export type ChoiceQuestion = {
  id: Exclude<QuestionId, "q1" | "q9">;
  kind: "choice";
  prompt: string;
  help?: string;
  options: Array<{ id: string; label: string }>;
  /** Scored questions contribute to ranking; private questions never leave the browser or host-guidance scope. */
  scoring: "scored" | "host_guidance" | "private";
};

export type NumericQuestion = { id: "q1"; kind: "number"; prompt: string; help: string; scoring: "eligibility" };
export type SongQuestion = { id: "q9"; kind: "song"; prompt: string; help: string; scoring: "none" };

export type Question = ChoiceQuestion | NumericQuestion | SongQuestion;

export const QUESTIONS: readonly Question[] = [
  {
    id: "q1",
    kind: "number",
    prompt: "How old are you?",
    help: "Trips are for adults. Each departure has its own age range, which you will see before booking.",
    scoring: "eligibility",
  },
  {
    id: "q2",
    kind: "choice",
    prompt: "You’ve just checked in. You know nobody yet. Which first hello feels easiest?",
    options: [
      { id: "chai_two_people", label: "Chai with two people" },
      { id: "team_game", label: "A team game" },
      { id: "dinner_everyone", label: "Dinner with everyone" },
      { id: "settle_first", label: "Settle in first" },
    ],
    scoring: "host_guidance",
  },
  {
    id: "q3",
    kind: "choice",
    prompt: "Tomorrow’s sunrise is supposed to be unreal. The catch? A 5:30 a.m. alarm. What’s your move?",
    options: [
      { id: "do_the_hike", label: "Do the hike" },
      { id: "short_walk_viewpoint", label: "Short walk to the viewpoint" },
      { id: "sleep_in_breakfast", label: "Sleep in and join at breakfast" },
    ],
    scoring: "scored",
  },
  {
    id: "q4",
    kind: "choice",
    prompt: "You’ve got one free afternoon. Which plan gets your vote?",
    options: [
      { id: "local_food_trail", label: "Local food trail" },
      { id: "scenic_trail", label: "Scenic trail" },
      { id: "pottery_or_cooking", label: "Pottery or cooking" },
      { id: "explore_old_town", label: "Explore the old town" },
    ],
    scoring: "scored",
  },
  {
    id: "q5",
    kind: "choice",
    prompt: "You find a lakeside café. Staying means missing the next stop. What do you prefer?",
    options: [
      { id: "stick_to_plan", label: "Stick to the plan" },
      { id: "group_vote", label: "Take a group vote" },
      { id: "stay_at_cafe", label: "Stay at the café" },
    ],
    scoring: "scored",
  },
  {
    id: "q6",
    kind: "choice",
    prompt: "Dinner’s done and nobody has to be up early. Where would we find you?",
    options: [
      { id: "karaoke", label: "Karaoke" },
      { id: "cards", label: "Cards" },
      { id: "bonfire_stories", label: "Bonfire stories" },
      { id: "quiet_balcony", label: "A quiet balcony" },
    ],
    scoring: "scored",
  },
  {
    id: "q7",
    kind: "choice",
    prompt: "You hit it off with someone on day one. What about day two?",
    options: [
      { id: "more_time_together", label: "More time together" },
      { id: "one_plan_then_mingle", label: "One plan together, then mingle" },
      { id: "mix_groups", label: "Mix groups" },
    ],
    scoring: "host_guidance",
  },
  {
    id: "q8",
    kind: "choice",
    prompt: "What are you hoping this trip makes room for?",
    help: "This stays private. It never affects your matches, is never shown to hosts, and is not stored with your booking.",
    options: [
      { id: "new_friendships", label: "New friendships" },
      { id: "romantic_spark", label: "A romantic spark" },
      { id: "open_to_both", label: "Open to both" },
      { id: "keep_private", label: "I’d rather keep it private" },
    ],
    scoring: "private",
  },
  {
    id: "q9",
    kind: "song",
    prompt: "The bus is pulling out. You get the first song. What are we playing?",
    help: "Optional. We’ll ask separately before adding it to the circle playlist.",
    scoring: "none",
  },
];

export const SCORED_QUESTIONS = ["q3", "q4", "q5", "q6"] as const;
export type ScoredQuestionId = (typeof SCORED_QUESTIONS)[number];

export const QUESTION_INDEX: Record<QuestionId, number> = Object.fromEntries(QUESTIONS.map((q, i) => [q.id, i])) as Record<QuestionId, number>;

export function getQuestion(id: QuestionId): Question {
  return QUESTIONS[QUESTION_INDEX[id]];
}

export function optionLabel(questionId: QuestionId, optionId: string): string | null {
  const q = getQuestion(questionId);
  if (q.kind !== "choice") return null;
  return q.options.find((o) => o.id === optionId)?.label ?? null;
}

export function isValidOption(questionId: QuestionId, optionId: string): boolean {
  const q = getQuestion(questionId);
  return q.kind === "choice" && q.options.some((o) => o.id === optionId);
}
