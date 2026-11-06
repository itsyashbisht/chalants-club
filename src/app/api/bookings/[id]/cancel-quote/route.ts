import { z } from "zod";
import { route, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { rateLimit } from "@/lib/ratelimit";
import { createCancelQuote } from "@/features/bookings/service";

export const runtime = "nodejs";

/** Previews the exact refund for cancelling now. The quote ID must be used to commit within its validity window. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  requireSameOrigin(req);
  const user = await requireUser();
  const { id } = await ctx.params;
  const bookingId = z.string().uuid().parse(id);
  await rateLimit({ key: `cancel-quote:${user.id}`, max: 20, windowSeconds: 60 });
  const { quote, breakdown } = await createCancelQuote({ bookingId, userId: user.id });
  return jsonPrivate({ quoteId: quote.id, expiresAt: quote.expiresAt, refundPaise: breakdown.refundPaise, capturedPaise: breakdown.capturedPaise, rule: breakdown.rule, perPayment: breakdown.perPayment });
});
