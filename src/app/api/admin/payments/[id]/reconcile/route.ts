import { z } from "zod";
import { route, parseJson, jsonPrivate, requireSameOrigin } from "@/lib/http";
import { requireRole } from "@/lib/auth/server";
import { reconcileGatewayOrder, reconcilePaymentAttempt } from "@/features/payments/reconcile";
import { submitRefund } from "@/features/payments/refund-worker";

export const runtime = "nodejs";

const bodySchema = z.object({ kind: z.enum(["order", "payment", "refund"]) });

/**
 * Finance re-fetches canonical provider state for an order or payment, or retries a refund using its original
 * immutable request. Idempotent and audited.
 */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  requireSameOrigin(req);
  const finance = await requireRole("finance", "operator");
  const { id } = await ctx.params;
  const targetId = z.string().uuid().parse(id);
  const body = await parseJson(req, bodySchema);
  if (body.kind === "order") {
    const result = await reconcileGatewayOrder(targetId, {}, finance.id);
    return jsonPrivate({ kind: "order", ...result });
  }
  if (body.kind === "payment") {
    await reconcilePaymentAttempt(targetId, {}, finance.id);
    return jsonPrivate({ kind: "payment", ok: true });
  }
  const refund = await submitRefund(targetId, {});
  return jsonPrivate({ kind: "refund", state: refund?.state ?? "unknown", providerRefundId: refund?.providerRefundId ?? null });
});
