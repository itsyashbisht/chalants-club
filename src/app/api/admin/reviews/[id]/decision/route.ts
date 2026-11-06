import { z } from "zod";
import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireRole } from "@/lib/auth/server";
import { decideReview } from "@/features/verification/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  expectedRevision: z.number().int().positive(),
  decision: z.enum(["approved", "rejected", "info_requested"]),
  reasonCode: z.string().min(1).max(60),
  note: z.string().trim().max(1000).optional(),
});

/** Reviewer decision with optimistic concurrency. A stale revision returns 409. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  requireSameOrigin(req);
  const reviewer = await requireRole("reviewer", "operator");
  const { id } = await ctx.params;
  const reviewId = z.string().uuid().parse(id);
  const body = await parseJson(req, bodySchema);
  const result = await decideReview({ reviewId, reviewerId: reviewer.id, ...body });
  return jsonPrivate({ decision: result.review.decision, revision: result.review.revision, bookingState: result.bookingState });
});
