import { z } from "zod";
import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { submitTrack, trackSchema } from "@/features/circle/service";

export const runtime = "nodejs";

const bodySchema = trackSchema.extend({ bookingId: z.string().uuid() });

/** Confirmed member suggests a track for the circle playlist (explicit consent required). */
export const POST = route<{ params: Promise<{ departureId: string }> }>(async (req, ctx) => {
  requireSameOrigin(req);
  const user = await requireUser();
  await ctx.params;
  const body = await parseJson(req, bodySchema);
  const row = await submitTrack(body.bookingId, user.id, body);
  return jsonPrivate({ title: row.title, artist: row.artist, approved: row.approved }, { status: 201 });
});
