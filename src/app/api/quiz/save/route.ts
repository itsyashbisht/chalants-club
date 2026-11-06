import { z } from "zod";
import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { matchAnswersSchema } from "@/features/quiz/answers";
import { saveSubmission } from "@/features/quiz/service";

export const runtime = "nodejs";

const bodySchema = z.object({ answers: matchAnswersSchema, trackConsent: z.boolean().default(false) });

/** Saves a signed-in traveller's answers after the guest-to-member handoff. */
export const POST = route(async (req) => {
  requireSameOrigin(req);
  const user = await requireUser();
  const body = await parseJson(req, bodySchema);
  const row = await saveSubmission(user.id, body.answers, body.trackConsent);
  return jsonPrivate({ id: row.id, savedAt: row.createdAt }, { status: 201 });
});
