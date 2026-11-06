import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireRole } from "@/lib/auth/server";
import { createDeparture, departureInputSchema } from "@/features/trips/service";

export const runtime = "nodejs";

/** Operator creates a draft departure. */
export const POST = route(async (req) => {
  requireSameOrigin(req);
  const operator = await requireRole("operator");
  const body = await parseJson(req, departureInputSchema);
  const departure = await createDeparture(body, operator.id);
  return jsonPrivate({ id: departure.id, status: departure.status, version: departure.version }, { status: 201 });
});
