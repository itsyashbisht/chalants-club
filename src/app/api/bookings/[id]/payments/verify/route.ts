import { z } from "zod";
import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { rateLimit } from "@/lib/ratelimit";
import { verifyCheckoutResponse } from "@/features/payments/verify";
import { loadBookingDetail } from "@/features/bookings/service";
import { toStatusView } from "@/features/bookings/status";

export const runtime = "nodejs";

const bodySchema = z.object({
  razorpay_order_id: z.string().min(1).max(64),
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_signature: z.string().min(1).max(256),
});

/** Confirms a Checkout response. Returns the authoritative booking stage, or 202 while the capture is unresolved. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  requireSameOrigin(req);
  const user = await requireUser();
  const { id } = await ctx.params;
  const bookingId = z.string().uuid().parse(id);
  await rateLimit({ key: `verify:${user.id}`, max: 20, windowSeconds: 60 });
  const body = await parseJson(req, bodySchema);
  const result = await verifyCheckoutResponse({
    bookingId,
    userId: user.id,
    orderId: body.razorpay_order_id,
    paymentId: body.razorpay_payment_id,
    signature: body.razorpay_signature,
  });
  const detail = await loadBookingDetail(bookingId);
  const booking = detail ? toStatusView(detail) : null;
  if (result.status === "pending") return jsonPrivate({ status: "pending", reason: result.reason, booking }, { status: 202 });
  return jsonPrivate({ ...result, booking });
});
