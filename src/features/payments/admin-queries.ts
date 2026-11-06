import "@/lib/server-guard";
import { and, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/lib/db/client";
import { users } from "@/lib/db/core-schema";
import { bookings } from "@/features/bookings/schema";
import { allocations, gatewayOrders, paymentAttempts, refunds, webhookInbox } from "./schema";

/** Finance search by booking reference, order, payment or refund reference. Returns matching bookings and orphan payments. */
export async function searchPayments(q: string, db: DbOrTx = getDb()) {
  const term = q.trim();
  if (!term) return { bookings: [], orphanPayments: [], orphanRefunds: [] };
  const like = `%${term}%`;
  const [byRef, byOrder, byPayment, byRefund] = await Promise.all([
    db.select({ id: bookings.id }).from(bookings).where(ilike(bookings.reference, like)).limit(20),
    db.select({ id: gatewayOrders.bookingId }).from(gatewayOrders).where(or(ilike(gatewayOrders.providerOrderId, like), ilike(gatewayOrders.receipt, like))).limit(20),
    db.select({ id: paymentAttempts.bookingId, attemptId: paymentAttempts.id }).from(paymentAttempts).where(ilike(paymentAttempts.providerPaymentId, like)).limit(20),
    db
      .select({ id: refunds.bookingId, refundId: refunds.id })
      .from(refunds)
      .where(or(ilike(refunds.providerRefundId, like), sql`${refunds.id}::text ilike ${like}`, ilike(refunds.receipt, like)))
      .limit(20),
  ]);
  const ids = new Set<string>();
  for (const r of [...byRef, ...byOrder]) if (r.id) ids.add(r.id);
  for (const r of byPayment) if (r.id) ids.add(r.id);
  for (const r of byRefund) if (r.id) ids.add(r.id);
  const bookingRows = ids.size
    ? await db
        .select({ id: bookings.id, reference: bookings.reference, state: bookings.state, totalPaise: bookings.totalPaise, createdAt: bookings.createdAt, email: users.email })
        .from(bookings)
        .innerJoin(users, eq(bookings.ownerId, users.id))
        .where(inArray(bookings.id, [...ids]))
        .orderBy(desc(bookings.createdAt))
    : [];
  const orphanPayments = byPayment.filter((p) => !p.id).length ? await db.select().from(paymentAttempts).where(inArray(paymentAttempts.id, byPayment.filter((p) => !p.id).map((p) => p.attemptId))) : [];
  const orphanRefunds = byRefund.filter((r) => !r.id).length ? await db.select().from(refunds).where(inArray(refunds.id, byRefund.filter((r) => !r.id).map((r) => r.refundId))) : [];
  return { bookings: bookingRows, orphanPayments, orphanRefunds };
}

export async function listRefundsNeedingAttention(db: DbOrTx = getDb()) {
  return db
    .select({ refund: refunds, payment: { providerPaymentId: paymentAttempts.providerPaymentId, amountPaise: paymentAttempts.amountPaise }, booking: { reference: bookings.reference } })
    .from(refunds)
    .innerJoin(paymentAttempts, eq(refunds.paymentAttemptId, paymentAttempts.id))
    .leftJoin(bookings, eq(refunds.bookingId, bookings.id))
    .where(inArray(refunds.state, ["requested", "processing", "failed"]))
    .orderBy(refunds.createdAt)
    .limit(100);
}

export async function listQuarantined(db: DbOrTx = getDb()) {
  return db
    .select({ allocation: allocations, payment: { providerPaymentId: paymentAttempts.providerPaymentId, providerOrderId: paymentAttempts.providerOrderId, id: paymentAttempts.id }, booking: { reference: bookings.reference } })
    .from(allocations)
    .innerJoin(paymentAttempts, eq(allocations.paymentAttemptId, paymentAttempts.id))
    .leftJoin(bookings, eq(allocations.bookingId, bookings.id))
    .where(and(sql`${allocations.outcome} <> 'applied'`, gte(allocations.createdAt, new Date(Date.now() - 30 * 86_400_000))))
    .orderBy(desc(allocations.createdAt))
    .limit(100);
}

export async function listInboxProblems(db: DbOrTx = getDb()) {
  return db
    .select()
    .from(webhookInbox)
    .where(or(inArray(webhookInbox.status, ["failed", "quarantined"]), and(eq(webhookInbox.status, "received"), sql`${webhookInbox.attempts} > 0`)))
    .orderBy(desc(webhookInbox.receivedAt))
    .limit(50);
}

export async function listOldPendingOrders(db: DbOrTx = getDb()) {
  return db
    .select({ order: gatewayOrders, booking: { reference: bookings.reference, state: bookings.state } })
    .from(gatewayOrders)
    .innerJoin(bookings, eq(gatewayOrders.bookingId, bookings.id))
    .where(and(inArray(gatewayOrders.requestState, ["created", "uncertain", "leased"]), sql`${gatewayOrders.createdAt} < now() - interval '30 minutes'`))
    .orderBy(gatewayOrders.createdAt)
    .limit(50);
}
