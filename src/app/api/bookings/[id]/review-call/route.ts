import { z } from "zod";
import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { rateLimit } from "@/lib/ratelimit";
import { requestReviewCall } from "@/features/verification/service";

export const runtime = "nodejs";

const bodySchema = z.object({ note: z.string().trim().min(3).max(500) });

/** Traveller requests a private review slot or leaves a contact request for the staffed queue. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  requireSameOrigin(req);
  const user = await requireUser();
  const { id } = await ctx.params;
  const bookingId = z.string().uuid().parse(id);
  await rateLimit({ key: `review-call:${user.id}`, max: 10, windowSeconds: 600 });
  const body = await parseJson(req, bodySchema);
  const review = await requestReviewCall({ bookingId, userId: user.id, note: body.note });
  return jsonPrivate({ callStatus: review.callStatus, callRequestedAt: review.callRequestedAt });
});
