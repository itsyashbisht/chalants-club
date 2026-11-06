import { z } from "zod";
import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireRole } from "@/lib/auth/server";
import { setCallStatus } from "@/features/verification/service";

export const runtime = "nodejs";

const bodySchema = z.object({ status: z.enum(["scheduled", "done", "inconclusive"]), note: z.string().trim().max(500).optional() });

/** Reviewer records call scheduling progress (no document details are ever stored). */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  requireSameOrigin(req);
  const reviewer = await requireRole("reviewer", "operator");
  const { id } = await ctx.params;
  const reviewId = z.string().uuid().parse(id);
  const body = await parseJson(req, bodySchema);
  const review = await setCallStatus({ reviewId, reviewerId: reviewer.id, status: body.status, note: body.note });
  return jsonPrivate({ callStatus: review.callStatus });
});
