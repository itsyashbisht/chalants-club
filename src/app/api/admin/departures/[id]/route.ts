import { z } from "zod";
import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireRole } from "@/lib/auth/server";
import { departureInputSchema, setDepartureStatus, updateDeparture } from "@/features/trips/service";

export const runtime = "nodejs";

const bodySchema = z.union([
  z.object({ action: z.enum(["publish", "close", "cancel", "complete"]), reason: z.string().trim().min(3).max(500), expectedVersion: z.number().int().positive() }),
  z.object({ action: z.literal("edit"), expectedVersion: z.number().int().positive(), data: departureInputSchema }),
]);

/** Operator edits or transitions a departure. Guarded by the expected version; audited. */
export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  requireSameOrigin(req);
  const operator = await requireRole("operator");
  const { id } = await ctx.params;
  const departureId = z.string().uuid().parse(id);
  const body = await parseJson(req, bodySchema);
  if (body.action === "edit") {
    const updated = await updateDeparture(departureId, body.data, operator.id);
    return jsonPrivate({ id: updated.id, status: updated.status, version: updated.version });
  }
  const result = await setDepartureStatus({ departureId, action: body.action, actorUserId: operator.id, reason: body.reason, expectedVersion: body.expectedVersion });
  return jsonPrivate({ id: result.departure.id, status: result.departure.status, version: result.departure.version, affectedBookings: result.affected });
});
