import { SCORED_QUESTIONS, optionLabel, type ScoredQuestionId } from "./questions";
import type { MatchAnswers } from "./answers";

/** Minimal departure shape the ranker needs; the query layer fills it from the database. */
export type RankableDeparture = {
  id: string;
  startDate: string;
  minAge: number;
  maxAge: number;
  seatsLeft: number;
  tags: Array<{ question: string; optionId: string; fact: string }>;
};

export type MatchReason = { question: ScoredQuestionId; preference: string; fact: string };

export type RankedDeparture = {
  id: string;
  points: number;
  reasons: MatchReason[];
  soldOut: boolean;
};

export type RankingResult = {
  eligible: RankedDeparture[];
  soldOut: RankedDeparture[];
};

/**
 * v1 ranking: one point per exact option match on Q3–Q6 (equal weight). Sorted by points, then nearest date,
 * then stable ID. Q2/Q7 are host guidance; Q8/Q9 never affect scoring.
 */
export function rankDepartures(answers: MatchAnswers, departures: RankableDeparture[]): RankingResult {
  const ageEligible = departures.filter((d) => answers.age >= d.minAge && answers.age <= d.maxAge);
  const ranked = ageEligible.map((d) => {
    const reasons: MatchReason[] = [];
    for (const q of SCORED_QUESTIONS) {
      const chosen = answers[q];
      const tag = d.tags.find((t) => t.question === q && t.optionId === chosen);
      if (tag) {
        reasons.push({ question: q, preference: optionLabel(q, chosen) ?? chosen, fact: tag.fact });
      }
    }
    return { id: d.id, points: reasons.length, reasons: reasons.slice(0, 2), soldOut: d.seatsLeft <= 0, startDate: d.startDate };
  });
  ranked.sort((a, b) => b.points - a.points || a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
  const strip = ({ id, points, reasons, soldOut }: (typeof ranked)[number]): RankedDeparture => ({ id, points, reasons, soldOut });
  return {
    eligible: ranked.filter((r) => !r.soldOut).map(strip),
    soldOut: ranked.filter((r) => r.soldOut).map(strip),
  };
}
