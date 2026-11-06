import { z } from "zod";
import { route, parseJson, clientIp, requireSameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getCurrentUser } from "@/lib/auth/server";
import { joinWaitlist, waitlistInputSchema } from "@/features/trips/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const bodySchema = waitlistInputSchema.omit({ departureId: true });

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  requireSameOrigin(req);
  const { id } = await ctx.params;
  const departureId = z.string().uuid().parse(id);
  await rateLimit({ key: `waitlist:${clientIp(req)}`, max: 10, windowSeconds: 600 });
  const body = await parseJson(req, bodySchema);
  const user = await getCurrentUser();
  const result = await joinWaitlist({ ...body, departureId }, user?.id ?? null);
  return NextResponse.json(result, { status: 202, headers: { "Cache-Control": "no-store" } });
});
