import { route, parseJson, jsonPrivate, requireSameOrigin, clientIp } from "@/lib/http";
import { getCurrentUser } from "@/lib/auth/server";
import { rateLimit } from "@/lib/ratelimit";
import { createSupportCase, supportInputSchema } from "@/features/support/service";

export const runtime = "nodejs";

/** Owner or rate-limited guest opens a support case; delivery to the staffed inbox is queued durably. */
export const POST = route(async (req) => {
  requireSameOrigin(req);
  const user = await getCurrentUser();
  await rateLimit({ key: `support:${user?.id ?? clientIp(req)}`, max: 5, windowSeconds: 600 });
  const body = await parseJson(req, supportInputSchema);
  const row = await createSupportCase(body, user?.id ?? null);
  return jsonPrivate({ caseId: row.id }, { status: 201 });
});
