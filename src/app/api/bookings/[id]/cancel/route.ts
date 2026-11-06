import { z } from "zod";
import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { cancelBookingByTraveller } from "@/features/bookings/service";

export const runtime = "nodejs";

const bodySchema = z.object({ quoteId: z.string().uuid() });

/** Commits a cancellation by quote ID. Replays return the recorded outcome. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  requireSameOrigin(req);
  const user = await requireUser();
  const { id } = await ctx.params;
  const bookingId = z.string().uuid().parse(id);
  const body = await parseJson(req, bodySchema);
  const result = await cancelBookingByTraveller({ bookingId, userId: user.id, quoteId: body.quoteId });
  return jsonPrivate({ state: "CANCELLED", refundPaise: result.breakdown.refundPaise, capturedPaise: result.breakdown.capturedPaise, rule: result.breakdown.rule, replayed: result.replayed });
});
