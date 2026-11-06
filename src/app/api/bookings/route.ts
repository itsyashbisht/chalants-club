import { z } from "zod";
import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { rateLimit } from "@/lib/ratelimit";
import { withIdempotency } from "@/lib/idempotency";
import { matchAnswersSchema } from "@/features/quiz/answers";
import { createHold } from "@/features/bookings/service";
import { loadBookingDetail } from "@/features/bookings/service";
import { toStatusView } from "@/features/bookings/status";

export const runtime = "nodejs";

const bodySchema = z.object({
  departureId: z.string().uuid(),
  quoteVersion: z.number().int().positive(),
  policyVersionId: z.string().uuid(),
  age: z.number().int().min(18).max(99),
  quiz: matchAnswersSchema.nullable().default(null),
  attestations: z.object({ single: z.literal(true), conduct: z.literal(true), policy: z.literal(true) }),
  clientOperationKey: z.string().min(8).max(80).optional(),
});

/**
 * Reserves one seat. Client-supplied money, owner and eligibility are ignored; the server re-reads price and
 * inventory under lock. Returns the existing owned hold on replay.
 */
export const POST = route(async (req) => {
  requireSameOrigin(req);
  const user = await requireUser();
  await rateLimit({ key: `bookings:${user.id}`, max: 20, windowSeconds: 60 });
  const body = await parseJson(req, bodySchema);
  const result = await withIdempotency({ actorId: user.id, operation: "bookings.create", key: body.clientOperationKey, request: body }, async () => {
    const { booking, created } = await createHold({
      userId: user.id,
      departureId: body.departureId,
      quoteVersion: body.quoteVersion,
      policyVersionId: body.policyVersionId,
      travellerAge: body.age,
      quiz: body.quiz ? { version: body.quiz.version, answers: stripPrivate(body.quiz), track: body.quiz.track ?? null } : null,
      attestations: body.attestations,
      clientOperationKey: body.clientOperationKey,
    });
    const detail = await loadBookingDetail(booking.id);
    return { status: created ? 201 : 200, body: { booking: toStatusView(detail!), created } };
  });
  return jsonPrivate(result.body, { status: result.status });
});

function stripPrivate(quiz: z.infer<typeof matchAnswersSchema>): Record<string, string | number> {
  const excluded = new Set(["track", "version"]);
  return Object.fromEntries(Object.entries(quiz).filter(([k, v]) => !excluded.has(k) && v !== undefined)) as Record<string, string | number>;
}
