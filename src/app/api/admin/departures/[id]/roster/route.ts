import { z } from "zod";
import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireRole, hasRole } from "@/lib/auth/server";
import { approveTrack, hostRoster, markAttendance } from "@/features/circle/service";
import { errors } from "@/lib/errors";

export const runtime = "nodejs";

const bodySchema = z.union([
  z.object({ action: z.literal("attendance"), prefId: z.string().uuid(), attended: z.boolean() }),
  z.object({ action: z.literal("track"), bookingId: z.string().uuid(), approved: z.boolean() }),
]);

/** Host (assigned) or operator runs the arrival: marks attendance and approves playlist tracks. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  requireSameOrigin(req);
  const user = await requireRole("host", "operator");
  const { id } = await ctx.params;
  const departureId = z.string().uuid().parse(id);
  if (!hasRole(user, "operator")) {
    try {
      await hostRoster(departureId, user.id);
    } catch {
      throw errors.forbidden("You are not assigned to this departure.");
    }
  }
  const body = await parseJson(req, bodySchema);
  if (body.action === "attendance") {
    const row = await markAttendance(body.prefId, body.attended, user.id);
    return jsonPrivate({ attended: row.attended });
  }
  const row = await approveTrack(departureId, body.bookingId, body.approved, user.id);
  return jsonPrivate({ approved: row.approved });
});
