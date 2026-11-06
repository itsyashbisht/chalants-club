import { NextResponse } from "next/server";
import { route, parseJson, clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { matchAnswersSchema } from "@/features/quiz/answers";
import { matchDepartures } from "@/features/quiz/service";

export const runtime = "nodejs";

/** Guest ranking. Validates the quiz version and answers; returns public departure data with factual reasons. */
export const POST = route(async (req) => {
  await rateLimit({ key: `quiz:${clientIp(req)}`, max: 60, windowSeconds: 60 });
  const answers = await parseJson(req, matchAnswersSchema);
  const result = await matchDepartures(answers);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
});
