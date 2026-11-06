import { z } from "zod";
import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { preferencesSchema, updatePreferences } from "@/features/circle/service";

export const runtime = "nodejs";

const bodySchema = preferencesSchema.extend({ bookingId: z.string().uuid() });

/** Confirmed traveller updates what they share with the host and the circle, or opts out of reconnect. */
export const POST = route(async (req) => {
  requireSameOrigin(req);
  const user = await requireUser();
  const body = await parseJson(req, bodySchema);
  const { bookingId, ...prefs } = body;
  const row = await updatePreferences(bookingId, user.id, prefs);
  return jsonPrivate({ updatedAt: row.updatedAt });
});
