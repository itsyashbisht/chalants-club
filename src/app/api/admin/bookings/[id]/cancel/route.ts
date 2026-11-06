import { z } from "zod";
import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireRole } from "@/lib/auth/server";
import { cancelBookingByOperator } from "@/features/bookings/service";

export const runtime = "nodejs";

const bodySchema = z.object({ reason: z.string().trim().min(3).max(500) });

/** Operator cancels a booking: seat released, every captured instalment refunded in full. Audited. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  requireSameOrigin(req);
  const operator = await requireRole("operator");
  const { id } = await ctx.params;
  const bookingId = z.string().uuid().parse(id);
  const body = await parseJson(req, bodySchema);
  const breakdown = await cancelBookingByOperator({ bookingId, actorUserId: operator.id, reason: body.reason });
  return jsonPrivate({ state: "CANCELLED", refundPaise: breakdown.refundPaise, capturedPaise: breakdown.capturedPaise });
});
