import "@/lib/server-guard";
import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { Clock } from "@/lib/clock";
import { getDb, type Db, type DbOrTx } from "@/lib/db/client";
import { withClockTx, retryTx } from "@/lib/db/tx";
import { log } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { ProviderError, type PaymentProvider } from "@/lib/razorpay/provider";
import { getPaymentProvider } from "@/lib/razorpay/client";
import { bookings } from "@/features/bookings/schema";
import { allocations, gatewayOrders, paymentAttempts, refunds, webhookInbox, outbox } from "./schema";
import { recordProviderPayment } from "./allocation";
import { reconcilePaymentRefunds, syncProviderRefund, providerRefundSchema } from "./refund-worker";
import { reconcileOrderByReceipt } from "./orders";
import { enqueue } from "./outbox";

type Deps = { clock?: Clock; db?: Db; provider?: PaymentProvider };

/** Re-fetches payments for a provider order and applies any capture through the shared allocation path. */
export async function reconcileGatewayOrder(gatewayOrderId: string, deps: Deps = {}, actorUserId?: string): Promise<{ captured: number }> {
  const provider = deps.provider ?? getPaymentProvider();
  const db = deps.db ?? getDb();
  const [order] = await db.select().from(gatewayOrders).where(eq(gatewayOrders.id, gatewayOrderId)).limit(1);
  if (!order) return { captured: 0 };
  if (!order.providerOrderId) {
    await reconcileOrderByReceipt(db, provider, order.id, order.receipt);
    return { captured: 0 };
  }
  let payments;
  try {
    payments = await provider.fetchOrderPayments(order.providerOrderId);
  } catch (error: unknown) {
    log.warn("reconcile.order_fetch_failed", { gatewayOrderId, error });
    return { captured: 0 };
  }
  let captured = 0;
  for (const payment of payments) {
    await retryTx(() =>
      withClockTx(async (tx, now) => {
        const { result } = await recordProviderPayment(tx, { mode: provider.mode, payment, source: "reconcile", now });
        if (result.outcome === "applied") captured += 1;
      }, deps),
    );
  }
  if (actorUserId) {
    await audit(db, { actorType: "user", actorUserId, operation: "order.reconciled", entityType: "gateway_order", entityId: order.id, metadata: { payments: payments.length, captured } });
  }
  return { captured };
}

/** Re-fetches one payment and its refunds from the provider (finance action, idempotent and audited). */
export async function reconcilePaymentAttempt(paymentAttemptId: string, deps: Deps = {}, actorUserId?: string): Promise<void> {
  const provider = deps.provider ?? getPaymentProvider();
  const db = deps.db ?? getDb();
  const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, paymentAttemptId)).limit(1);
  if (!attempt) return;
  try {
    const payment = await provider.fetchPayment(attempt.providerPaymentId);
    await retryTx(() => withClockTx((tx, now) => recordProviderPayment(tx, { mode: provider.mode, payment, source: "reconcile", now }), deps));
  } catch (error: unknown) {
    if (!(error instanceof ProviderError && error.kind === "not_found")) log.warn("reconcile.payment_fetch_failed", { paymentAttemptId, error });
  }
  await reconcilePaymentRefunds(attempt.id, { ...deps, provider, db });
  if (actorUserId) {
    await audit(db, { actorType: "user", actorUserId, operation: "payment.reconciled", entityType: "payment_attempt", entityId: attempt.id });
  }
}

/**
 * Job: before a hold or balance window lapses, check provider orders that are still payable so a capture whose
 * callback and webhook were both lost is applied rather than refunded. Also sweeps orders older than two minutes.
 */
export async function reconcilePendingOrders(deps: Deps = {}, opts: { nearExpiryMinutes?: number; limit?: number } = {}): Promise<{ checked: number; captured: number }> {
  const provider = deps.provider ?? getPaymentProvider();
  const db = deps.db ?? getDb();
  const now = deps.clock ? deps.clock.now() : new Date();
  const soon = new Date(now.getTime() + (opts.nearExpiryMinutes ?? 3) * 60_000);
  const twoMinutesAgo = new Date(now.getTime() - 2 * 60_000);
  const rows = await db
    .select({ id: gatewayOrders.id })
    .from(gatewayOrders)
    .innerJoin(bookings, eq(gatewayOrders.bookingId, bookings.id))
    .where(
      and(
        inArray(gatewayOrders.requestState, ["created", "uncertain"]),
        inArray(bookings.state, ["HELD", "BALANCE_DUE"]),
        or(
          and(eq(bookings.state, "HELD"), lte(bookings.holdExpiresAt, soon)),
          and(eq(bookings.state, "BALANCE_DUE"), lte(bookings.balanceDueAt, soon)),
          lte(gatewayOrders.createdAt, twoMinutesAgo),
        ),
      ),
    )
    .limit(opts.limit ?? 25);
  let captured = 0;
  for (const { id } of rows) {
    const result = await reconcileGatewayOrder(id, { ...deps, provider, db });
    captured += result.captured;
  }
  return { checked: rows.length, captured };
}

/** Job: refunds stuck in processing are re-checked against provider evidence before any retry. */
export async function reconcileProcessingRefunds(deps: Deps = {}, limit = 25): Promise<{ checked: number }> {
  const provider = deps.provider ?? getPaymentProvider();
  const db = deps.db ?? getDb();
  const now = deps.clock ? deps.clock.now() : new Date();
  const stale = new Date(now.getTime() - 5 * 60_000);
  const rows = await db
    .select()
    .from(refunds)
    .where(and(eq(refunds.state, "processing"), lte(refunds.updatedAt, stale)))
    .limit(limit);
  for (const refund of rows) {
    try {
      if (refund.providerRefundId) {
        const fresh = await provider.fetchRefund(refund.providerRefundId);
        await withClockTx((tx, txNow) => syncProviderRefund(tx, { mode: provider.mode, refund: providerRefundSchema.parse(fresh), now: txNow }), deps);
      } else {
        await reconcilePaymentRefunds(refund.paymentAttemptId, { ...deps, provider, db });
        const [after] = await db.select().from(refunds).where(eq(refunds.id, refund.id)).limit(1);
        if (!after.providerRefundId && (!after.nextRetryAt || after.nextRetryAt.getTime() <= now.getTime())) {
          await enqueue(db, "refund.submit", `refund.submit:${refund.id}:reconcile:${after.attempts}`, { refundId: refund.id });
        }
      }
    } catch (error: unknown) {
      log.warn("reconcile.refund_failed", { refundId: refund.id, error });
    }
  }
  return { checked: rows.length };
}

/** Totals for the finance page and the daily comparison against provider records. */
export async function ledgerSummary(db: DbOrTx = getDb()) {
  const [captured] = await db
    .select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${paymentAttempts.amountPaise}), 0)` })
    .from(paymentAttempts)
    .where(inArray(paymentAttempts.status, ["captured", "refunded"]));
  const [applied] = await db
    .select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${allocations.amountPaise}), 0)` })
    .from(allocations)
    .where(eq(allocations.outcome, "applied"));
  const [unapplied] = await db
    .select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${allocations.amountPaise}), 0)` })
    .from(allocations)
    .where(sql`${allocations.outcome} <> 'applied'`);
  const refundRows = await db
    .select({ state: refunds.state, n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)` })
    .from(refunds)
    .groupBy(refunds.state);
  const [pendingOrders] = await db
    .select({ n: sql<number>`count(*)` })
    .from(gatewayOrders)
    .where(and(inArray(gatewayOrders.requestState, ["created", "uncertain", "leased"]), lte(gatewayOrders.createdAt, new Date(Date.now() - 30 * 60_000))));
  const [inboxBacklog] = await db.select({ n: sql<number>`count(*)` }).from(webhookInbox).where(eq(webhookInbox.status, "received"));
  const [inboxFailed] = await db.select({ n: sql<number>`count(*)` }).from(webhookInbox).where(inArray(webhookInbox.status, ["failed", "quarantined"]));
  const [outboxBacklog] = await db.select({ n: sql<number>`count(*)` }).from(outbox).where(eq(outbox.status, "pending"));
  const [oldestRefund] = await db
    .select({ createdAt: refunds.createdAt })
    .from(refunds)
    .where(inArray(refunds.state, ["requested", "processing"]))
    .orderBy(refunds.createdAt)
    .limit(1);
  const [lateCaptures] = await db
    .select({ n: sql<number>`count(*)` })
    .from(allocations)
    .where(and(eq(allocations.outcome, "unapplied_late"), gte(allocations.createdAt, new Date(Date.now() - 7 * 86_400_000))));
  return {
    captured: { count: Number(captured.n), paise: Number(captured.total) },
    applied: { count: Number(applied.n), paise: Number(applied.total) },
    unapplied: { count: Number(unapplied.n), paise: Number(unapplied.total) },
    refunds: refundRows.map((r) => ({ state: r.state, count: Number(r.n), paise: Number(r.total) })),
    oldPendingOrders: Number(pendingOrders.n),
    inboxBacklog: Number(inboxBacklog.n),
    inboxFailed: Number(inboxFailed.n),
    outboxBacklog: Number(outboxBacklog.n),
    oldestPendingRefundAt: oldestRefund?.createdAt ?? null,
    lateCapturesLast7Days: Number(lateCaptures.n),
  };
}
