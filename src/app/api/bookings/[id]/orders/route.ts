import { z } from "zod";
import { NextResponse } from "next/server";
import { route, parseJson, jsonPrivate, requireSameOrigin, PRIVATE_HEADERS } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { rateLimit } from "@/lib/ratelimit";
import { createCheckoutOrder } from "@/features/payments/orders";

export const runtime = "nodejs";

const bodySchema = z.object({ instalment: z.enum(["deposit", "balance"]) });

/** Returns Checkout configuration for the deposit or balance, or 202 while a provider order is being created. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  requireSameOrigin(req);
  const user = await requireUser();
  const { id } = await ctx.params;
  const bookingId = z.string().uuid().parse(id);
  await rateLimit({ key: `orders:${user.id}`, max: 30, windowSeconds: 60 });
  const body = await parseJson(req, bodySchema);
  const result = await createCheckoutOrder({ bookingId, kind: body.instalment, userId: user.id });
  if (result.status === "processing") {
    return NextResponse.json({ status: "processing", retryAfterSeconds: result.retryAfterSeconds }, { status: 202, headers: { ...PRIVATE_HEADERS, "Retry-After": String(result.retryAfterSeconds) } });
  }
  return jsonPrivate({ status: "ready", checkout: result.checkout });
});
