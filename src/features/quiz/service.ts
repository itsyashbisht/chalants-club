import "@/lib/server-guard";
import { desc, eq } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/lib/db/client";
import { listRankableDepartures } from "@/features/trips/queries";
import type { MatchAnswers } from "./answers";
import { rankDepartures, type RankedDeparture } from "./scoring";
import { quizSubmissions } from "./schema";
import { QUIZ_VERSION } from "./questions";

export type MatchResult = {
  version: typeof QUIZ_VERSION;
  eligible: Array<RankedDeparture & { departure: Awaited<ReturnType<typeof listRankableDepartures>>[number] }>;
  soldOut: Array<RankedDeparture & { departure: Awaited<ReturnType<typeof listRankableDepartures>>[number] }>;
  /** Truthful reason when nothing is eligible. */
  noneReason: string | null;
};

/** Ranks open departures for validated answers. Never exposes a compatibility score, only points and factual reasons. */
export async function matchDepartures(answers: MatchAnswers, now = new Date(), db: DbOrTx = getDb()): Promise<MatchResult> {
  const open = await listRankableDepartures(now, db);
  const ranking = rankDepartures(
    answers,
    open.map((d) => ({ id: d.id, startDate: d.startDate, minAge: d.minAge, maxAge: d.maxAge, seatsLeft: d.seatsLeft, tags: d.tags })),
  );
  const byId = new Map(open.map((d) => [d.id, d]));
  const attach = (r: RankedDeparture) => ({ ...r, departure: byId.get(r.id)! });
  let noneReason: string | null = null;
  if (ranking.eligible.length === 0 && ranking.soldOut.length === 0) {
    noneReason =
      open.length === 0
        ? "There are no departures open for booking right now."
        : `None of the open departures accept travellers aged ${answers.age}. Age ranges are set per departure by the organiser.`;
  } else if (ranking.eligible.length === 0) {
    noneReason = "Every departure that fits your age range is currently full. You can join a waitlist below.";
  }
  return { version: QUIZ_VERSION, eligible: ranking.eligible.map(attach), soldOut: ranking.soldOut.map(attach), noneReason };
}

/** Saves answers for a signed-in traveller. The optional track is kept; private intent is never accepted here. */
export async function saveSubmission(userId: string, answers: MatchAnswers, trackConsent: boolean, db: DbOrTx = getDb()) {
  const { track, version, ...rest } = answers;
  const [row] = await db
    .insert(quizSubmissions)
    .values({
      userId,
      version,
      answers: rest,
      trackTitle: track?.title ?? null,
      trackArtist: track?.artist ?? null,
      trackConsentAt: track && trackConsent ? new Date() : null,
    })
    .returning();
  return row;
}

export async function latestSubmission(userId: string, db: DbOrTx = getDb()) {
  const [row] = await db.select().from(quizSubmissions).where(eq(quizSubmissions.userId, userId)).orderBy(desc(quizSubmissions.createdAt)).limit(1);
  return row ?? null;
}
