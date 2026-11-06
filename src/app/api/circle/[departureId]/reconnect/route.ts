import { z } from "zod";
import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { chooseReconnect } from "@/features/circle/service";

export const runtime = "nodejs";

const bodySchema = z.object({ toUserId: z.string().uuid() });

/** Private mutual reconnect after a completed trip. Contact details are revealed only when both choose each other. */
export const POST = route<{ params: Promise<{ departureId: string }> }>(async (req, ctx) => {
  requireSameOrigin(req);
  const user = await requireUser();
  const { departureId } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  const result = await chooseReconnect(z.string().uuid().parse(departureId), user.id, body.toUserId);
  return jsonPrivate(result);
});
