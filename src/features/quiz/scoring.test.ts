import { describe, expect, it } from "vitest";
import { rankDepartures, type RankableDeparture } from "./scoring";
import { matchAnswersSchema } from "./answers";

const base = { version: "v1" as const, age: 30, q3: "do_the_hike", q4: "local_food_trail", q5: "stick_to_plan", q6: "karaoke" };

function departure(id: string, startDate: string, tags: Array<[string, string]>, extra: Partial<RankableDeparture> = {}): RankableDeparture {
  return { id, startDate, minAge: 25, maxAge: 40, seatsLeft: 3, tags: tags.map(([question, optionId]) => ({ question, optionId, fact: `fact ${question}` })), ...extra };
}

describe("rankDepartures", () => {
  it("awards one point per exact Q3–Q6 match and sorts by points, date, id", () => {
    const result = rankDepartures(base, [
      departure("b", "2026-12-20", [["q3", "do_the_hike"]]),
      departure("a", "2026-12-20", [["q3", "do_the_hike"]]),
      departure("c", "2026-12-01", [["q3", "do_the_hike"], ["q4", "local_food_trail"], ["q6", "karaoke"]]),
      departure("d", "2026-11-15", []),
    ]);
    expect(result.eligible.map((r) => r.id)).toEqual(["c", "a", "b", "d"]);
    expect(result.eligible[0].points).toBe(3);
    expect(result.eligible[0].reasons).toHaveLength(2); // at most two reasons are explained
    expect(result.eligible[3].points).toBe(0);
  });

  it("filters by age and separates sold-out departures", () => {
    const result = rankDepartures({ ...base, age: 45 }, [departure("x", "2026-12-01", [], { maxAge: 40 }), departure("y", "2026-12-01", [], { maxAge: 50, seatsLeft: 0 })]);
    expect(result.eligible).toEqual([]);
    expect(result.soldOut.map((r) => r.id)).toEqual(["y"]);
  });

  it("ignores Q2/Q7/Q8/Q9 for scoring and rejects private intent in the answer schema", () => {
    const withGuidance = rankDepartures({ ...base, q2: "team_game", q7: "mix_groups" }, [departure("a", "2026-12-01", [["q2", "team_game"], ["q7", "mix_groups"]])]);
    expect(withGuidance.eligible[0].points).toBe(0);
    const parsed = matchAnswersSchema.safeParse({ ...base, q8: "romantic_spark" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "q8" in parsed.data).toBe(false);
  });

  it("rejects under-18 ages and unknown option IDs", () => {
    expect(matchAnswersSchema.safeParse({ ...base, age: 17 }).success).toBe(false);
    expect(matchAnswersSchema.safeParse({ ...base, q4: "made_up" }).success).toBe(false);
  });
});
