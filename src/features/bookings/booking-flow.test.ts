import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, truncateAll, closeDb } from "@/test/db";
import { deliverWebhook, installFakeProvider, makeDeparture, makeUser, paymentEventBody } from "@/test/fixtures";
import { fixedClock } from "@/lib/clock";
import { signCheckout } from "@/lib/razorpay/signature";
import type { FakePaymentProvider } from "@/lib/razorpay/fake";
import { createHold, expireDueBookings, createCancelQuote, cancelBookingByTraveller, loadBookingDetail } from "./service";
import { bookings } from "./schema";
import { createCheckoutOrder } from "@/features/payments/orders";
import { verifyCheckoutResponse } from "@/features/payments/verify";
import { decideReview } from "@/features/verification/service";
import { reviews } from "@/features/verification/schema";
import { allocations, gatewayOrders, instalments, outbox, paymentAttempts, refunds } from "@/features/payments/schema";
import { circlePreferences } from "@/features/circle/schema";
import { processOutboxBatch } from "@/features/payments/outbox-worker";
import { emailDeliveries } from "@/lib/db/core-schema";
import { isAppError } from "@/lib/errors";

const START = new Date("2026-11-06T09:00:00.000Z");

let fake: FakePaymentProvider;
let clock: ReturnType<typeof fixedClock>;

beforeEach(async () => {
  await truncateAll();
  fake = installFakeProvider();
  clock = fixedClock(START);
});

afterAll(async () => {
  await closeDb();
});

const attestations = { single: true, conduct: true, policy: true } as const;

async function hold(userId: string, departure: { id: string; version: number; policyVersionId: string }, age = 30, key?: string) {
  return createHold({ userId, departureId: departure.id, quoteVersion: departure.version, policyVersionId: departure.policyVersionId, travellerAge: age, quiz: null, attestations, clientOperationKey: key }, { clock });
}

async function readyOrder(bookingId: string, kind: "deposit" | "balance", userId: string) {
  const result = await createCheckoutOrder({ bookingId, kind, userId }, { clock, provider: fake });
  if (result.status !== "ready") throw new Error(`expected ready order, got ${result.status}`);
  return result.checkout;
}

async function verify(bookingId: string, userId: string, orderId: string, paymentId: string) {
  return verifyCheckoutResponse({ bookingId, userId, orderId, paymentId, signature: signCheckout(fake.keySecret, orderId, paymentId) }, { clock, provider: fake, keySecret: fake.keySecret });
}

async function bookingState(id: string) {
  const [row] = await db.select({ state: bookings.state, balanceDueAt: bookings.balanceDueAt, revision: bookings.revision }).from(bookings).where(eq(bookings.id, id));
  return row;
}

/** Drives a booking to UNDER_REVIEW via the browser callback path. */
async function depositPaid(userId: string, departure: { id: string; version: number; policyVersionId: string }) {
  const { booking } = await hold(userId, departure);
  const checkout = await readyOrder(booking.id, "deposit", userId);
  const payment = fake.capture(checkout.orderId);
  const result = await verify(booking.id, userId, checkout.orderId, payment.id);
  expect(result.status).toBe("captured");
  return { booking, checkout, payment };
}

async function approve(bookingId: string, reviewerId: string) {
  const [review] = await db.select().from(reviews).where(eq(reviews.bookingId, bookingId));
  return decideReview({ reviewId: review.id, reviewerId, expectedRevision: review.revision, decision: "approved", reasonCode: "identity_confirmed" }, { clock });
}

describe("seat holds", () => {
  it("lets exactly one of two parallel bookings take the last seat", async () => {
    const [{ departure }, a, b] = await Promise.all([makeDeparture(START, { capacity: 1 }), makeUser(), makeUser()]);
    const results = await Promise.allSettled([hold(a.id, departure), hold(b.id, departure)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(isAppError(reason) && reason.code).toBe("SOLD_OUT");
  });

  it("returns the same hold on retry and rejects a different request with the same operation key", async () => {
    const { departure } = await makeDeparture(START, { capacity: 3 });
    const user = await makeUser();
    const first = await hold(user.id, departure, 30, "op-1");
    const again = await hold(user.id, departure, 30, "op-1");
    expect(again.created).toBe(false);
    expect(again.booking.id).toBe(first.booking.id);
  });

  it("rejects wrong age, closed departures and forged quote versions before any money moves", async () => {
    const { departure } = await makeDeparture(START, { capacity: 2, minAge: 25, maxAge: 35 });
    const user = await makeUser();
    await expect(hold(user.id, departure, 17)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(hold(user.id, departure, 40)).rejects.toMatchObject({ code: "AGE_INELIGIBLE" });
    await expect(hold(user.id, { ...departure, version: departure.version + 1 })).rejects.toMatchObject({ code: "QUOTE_CHANGED" });
    const { departure: draft } = await makeDeparture(START, { status: "draft" });
    await expect(hold(user.id, draft)).rejects.toMatchObject({ code: "NOT_OPEN" });
    expect(await db.select().from(bookings)).toHaveLength(0);
    expect(fake.orders.size).toBe(0);
  });

  it("snapshots the quote: 30% of ₹12,000 is ₹3,600 deposit and ₹8,400 balance", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const { booking } = await hold(user.id, departure);
    expect(booking.depositPaise).toBe(360_000);
    expect(booking.balancePaise).toBe(840_000);
    expect(booking.holdExpiresAt?.toISOString()).toBe(new Date(START.getTime() + 15 * 60_000).toISOString());
    expect(booking.quizSnapshot).toBeNull();
  });
});

describe("deposit orders and capture", () => {
  it("creates one provider order even when the pay button is double-clicked", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const { booking } = await hold(user.id, departure);
    const [first, second] = await Promise.all([
      createCheckoutOrder({ bookingId: booking.id, kind: "deposit", userId: user.id }, { clock, provider: fake }),
      createCheckoutOrder({ bookingId: booking.id, kind: "deposit", userId: user.id }, { clock, provider: fake }),
    ]);
    // The second caller either waits for the lease and sees the created order, or is told to retry shortly.
    expect([first.status, second.status].every((s) => s === "ready" || s === "processing")).toBe(true);
    const third = await createCheckoutOrder({ bookingId: booking.id, kind: "deposit", userId: user.id }, { clock, provider: fake });
    expect(third.status).toBe("ready");
    const orderIds = new Set([first, second, third].flatMap((r) => (r.status === "ready" ? [r.checkout.orderId] : [])));
    expect(orderIds.size).toBe(1);
    expect(fake.orders.size).toBe(1);
    const [order] = [...fake.orders.values()];
    expect(order.amount).toBe(360_000);
    expect(order.receipt?.length).toBeLessThanOrEqual(40);
  });

  it("refuses orders for foreign bookings and for an unapproved balance", async () => {
    const { departure } = await makeDeparture(START);
    const owner = await makeUser();
    const stranger = await makeUser();
    const { booking } = await hold(owner.id, departure);
    await expect(createCheckoutOrder({ bookingId: booking.id, kind: "deposit", userId: stranger.id }, { clock, provider: fake })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createCheckoutOrder({ bookingId: booking.id, kind: "balance", userId: owner.id }, { clock, provider: fake })).rejects.toMatchObject({ code: "WRONG_STAGE" });
    expect(fake.orders.size).toBe(0);
  });

  it("reconciles a lost provider response by receipt instead of creating a second order", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const { booking } = await hold(user.id, departure);
    fake.failNext("createOrder", "timeout");
    const result = await createCheckoutOrder({ bookingId: booking.id, kind: "deposit", userId: user.id }, { clock, provider: fake });
    expect(result.status).toBe("ready");
    expect(fake.orders.size).toBe(1);
    const rows = await db.select().from(gatewayOrders).where(eq(gatewayOrders.bookingId, booking.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].requestState).toBe("created");
  });

  it("applies the same capture once when the browser callback and the webhook both arrive", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const { booking, payment } = await depositPaid(user.id, departure);
    expect((await bookingState(booking.id)).state).toBe("UNDER_REVIEW");
    await deliverWebhook({ body: paymentEventBody("payment.captured", payment), provider: fake, clock, eventId: "evt_1" });
    await deliverWebhook({ body: paymentEventBody("payment.captured", payment), provider: fake, clock, eventId: "evt_1" });
    await deliverWebhook({ body: paymentEventBody("order.paid", payment, { order: { entity: { id: payment.order_id, amount: 360_000, currency: "INR", status: "paid" } } }), provider: fake, clock, eventId: "evt_2" });
    const applied = await db.select().from(allocations).where(eq(allocations.bookingId, booking.id));
    expect(applied.filter((a) => a.outcome === "applied")).toHaveLength(1);
    expect(await db.select().from(paymentAttempts)).toHaveLength(1);
    const receipts = await db.select().from(outbox).where(eq(outbox.kind, "email.deposit_receipt"));
    expect(receipts).toHaveLength(1);
  });

  it("applies a capture that arrives by webhook first with no browser return", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const { booking } = await hold(user.id, departure);
    const checkout = await readyOrder(booking.id, "deposit", user.id);
    const payment = fake.capture(checkout.orderId);
    await deliverWebhook({ body: paymentEventBody("payment.captured", payment), provider: fake, clock });
    expect((await bookingState(booking.id)).state).toBe("UNDER_REVIEW");
    const later = await verify(booking.id, user.id, checkout.orderId, payment.id);
    expect(later.status).toBe("captured");
    expect(later.status === "captured" && later.outcome.outcome).toBe("already_applied");
  });

  it("rejects a forged signature and never touches the booking", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const { booking } = await hold(user.id, departure);
    const checkout = await readyOrder(booking.id, "deposit", user.id);
    const payment = fake.capture(checkout.orderId);
    await expect(
      verifyCheckoutResponse({ bookingId: booking.id, userId: user.id, orderId: checkout.orderId, paymentId: payment.id, signature: signCheckout("wrong", checkout.orderId, payment.id) }, { clock, provider: fake, keySecret: fake.keySecret }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect((await bookingState(booking.id)).state).toBe("HELD");
  });

  it("keeps attempt history: a failed attempt, then success, then a late failure event", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const { booking } = await hold(user.id, departure);
    const checkout = await readyOrder(booking.id, "deposit", user.id);
    const failed = fake.fail(checkout.orderId);
    const failedResult = await verify(booking.id, user.id, checkout.orderId, failed.id);
    expect(failedResult.status).toBe("failed");
    expect((await bookingState(booking.id)).state).toBe("HELD");
    const success = fake.capture(checkout.orderId);
    await verify(booking.id, user.id, checkout.orderId, success.id);
    expect((await bookingState(booking.id)).state).toBe("UNDER_REVIEW");
    await deliverWebhook({ body: paymentEventBody("payment.failed", { ...success, status: "failed", captured: false }), provider: fake, clock });
    const attempts = await db.select().from(paymentAttempts).where(eq(paymentAttempts.bookingId, booking.id));
    expect(attempts.map((a) => a.status).sort()).toEqual(["captured", "failed"]);
    expect((await bookingState(booking.id)).state).toBe("UNDER_REVIEW");
  });

  it("records a second capture for the same instalment as a duplicate and refunds it", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const { checkout } = await depositPaid(user.id, departure);
    const duplicate = fake.capture(checkout.orderId);
    await deliverWebhook({ body: paymentEventBody("payment.captured", duplicate), provider: fake, clock });
    const dup = await db.select().from(allocations).where(eq(allocations.outcome, "unapplied_duplicate"));
    expect(dup).toHaveLength(1);
    const queued = await db.select().from(refunds);
    expect(queued).toHaveLength(1);
    expect(queued[0].amountPaise).toBe(360_000);
    expect(queued[0].origin).toBe("unapplied");
  });
});

describe("review, balance and expiry", () => {
  it("approval opens the balance exactly once and replays cannot extend the deadline", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const reviewer = await makeUser(undefined, ["reviewer"]);
    const { booking } = await depositPaid(user.id, departure);
    const [review] = await db.select().from(reviews).where(eq(reviews.bookingId, booking.id));
    const approved = await decideReview({ reviewId: review.id, reviewerId: reviewer.id, expectedRevision: review.revision, decision: "approved", reasonCode: "identity_confirmed" }, { clock });
    expect(approved.bookingState).toBe("BALANCE_DUE");
    const deadline = (await bookingState(booking.id)).balanceDueAt!;
    expect(deadline.toISOString()).toBe(new Date(START.getTime() + 24 * 3_600_000).toISOString());
    clock.advanceMinutes(60);
    await expect(decideReview({ reviewId: review.id, reviewerId: reviewer.id, expectedRevision: review.revision, decision: "approved", reasonCode: "identity_confirmed" }, { clock })).rejects.toMatchObject({ code: "STALE_REVIEW" });
    await expect(decideReview({ reviewId: review.id, reviewerId: reviewer.id, expectedRevision: review.revision + 1, decision: "approved", reasonCode: "identity_confirmed" }, { clock })).rejects.toMatchObject({ code: "WRONG_STAGE" });
    expect((await bookingState(booking.id)).balanceDueAt!.toISOString()).toBe(deadline.toISOString());
    const balance = await db.select().from(instalments).where(and(eq(instalments.bookingId, booking.id), eq(instalments.kind, "balance")));
    expect(balance).toHaveLength(1);
    expect(balance[0].amountPaise).toBe(840_000);
  });

  it("rejection releases the seat and refunds the deposit in full", async () => {
    const { departure } = await makeDeparture(START, { capacity: 1 });
    const user = await makeUser();
    const reviewer = await makeUser(undefined, ["reviewer"]);
    const { booking, payment } = await depositPaid(user.id, departure);
    const [review] = await db.select().from(reviews).where(eq(reviews.bookingId, booking.id));
    const result = await decideReview({ reviewId: review.id, reviewerId: reviewer.id, expectedRevision: review.revision, decision: "rejected", reasonCode: "identity_not_confirmed" }, { clock });
    expect(result.bookingState).toBe("REJECTED");
    const queued = await db.select().from(refunds).where(eq(refunds.bookingId, booking.id));
    expect(queued).toHaveLength(1);
    expect(queued[0].amountPaise).toBe(360_000);
    // Seat is free again for someone else.
    const other = await makeUser();
    await expect(hold(other.id, departure)).resolves.toMatchObject({ created: true });
    await processOutboxBatch(50, { clock, provider: fake });
    const providerRefund = [...fake.refunds.values()].find((r) => r.payment_id === payment.id);
    expect(providerRefund?.amount).toBe(360_000);
  });

  it("confirms the trip after the balance capture and opens the circle", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const reviewer = await makeUser(undefined, ["reviewer"]);
    const { booking } = await depositPaid(user.id, departure);
    await approve(booking.id, reviewer.id);
    const checkout = await readyOrder(booking.id, "balance", user.id);
    expect(checkout.amountPaise).toBe(840_000);
    const payment = fake.capture(checkout.orderId);
    const result = await verify(booking.id, user.id, checkout.orderId, payment.id);
    expect(result.status === "captured" && result.bookingState).toBe("CONFIRMED");
    expect(await db.select().from(circlePreferences).where(eq(circlePreferences.bookingId, booking.id))).toHaveLength(1);
    await processOutboxBatch(50, { clock, provider: fake });
    const emails = await db.select().from(emailDeliveries);
    expect(emails.map((e) => e.subject).some((s) => s.includes("confirmed"))).toBe(true);
  });

  it("expires an unpaid hold with the injected clock and refunds a deposit that lands late", async () => {
    const { departure } = await makeDeparture(START, { capacity: 1 });
    const user = await makeUser();
    const { booking } = await hold(user.id, departure);
    const checkout = await readyOrder(booking.id, "deposit", user.id);
    clock.advanceMinutes(16);
    const expired = await expireDueBookings({ clock });
    expect(expired.holdsExpired).toBe(1);
    expect((await bookingState(booking.id)).state).toBe("EXPIRED");
    const late = fake.capture(checkout.orderId);
    await deliverWebhook({ body: paymentEventBody("payment.captured", late), provider: fake, clock });
    expect((await bookingState(booking.id)).state).toBe("EXPIRED");
    const lateRows = await db.select().from(allocations).where(eq(allocations.outcome, "unapplied_late"));
    expect(lateRows).toHaveLength(1);
    const queued = await db.select().from(refunds);
    expect(queued).toHaveLength(1);
    expect(queued[0].amountPaise).toBe(360_000);
    const other = await makeUser();
    await expect(hold(other.id, departure)).resolves.toMatchObject({ created: true });
  });

  it("expires the balance window, refunds the deposit, and refunds a balance paid after the deadline", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const reviewer = await makeUser(undefined, ["reviewer"]);
    const { booking } = await depositPaid(user.id, departure);
    await approve(booking.id, reviewer.id);
    const checkout = await readyOrder(booking.id, "balance", user.id);
    clock.advanceMinutes(24 * 60 + 1);
    const expired = await expireDueBookings({ clock });
    expect(expired.balancesExpired).toBe(1);
    expect((await bookingState(booking.id)).state).toBe("EXPIRED");
    const depositRefunds = await db.select().from(refunds).where(eq(refunds.bookingId, booking.id));
    expect(depositRefunds.map((r) => r.amountPaise)).toEqual([360_000]);
    const late = fake.capture(checkout.orderId);
    await deliverWebhook({ body: paymentEventBody("payment.captured", late), provider: fake, clock });
    const all = await db.select().from(refunds).where(eq(refunds.bookingId, booking.id));
    expect(all.map((r) => r.amountPaise).sort((a, b) => a - b)).toEqual([360_000, 840_000]);
    expect((await bookingState(booking.id)).state).toBe("EXPIRED");
  });
});

describe("cancellation and refunds", () => {
  async function fullyPaid() {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const reviewer = await makeUser(undefined, ["reviewer"]);
    const { booking, payment: deposit } = await depositPaid(user.id, departure);
    await approve(booking.id, reviewer.id);
    const checkout = await readyOrder(booking.id, "balance", user.id);
    const balance = fake.capture(checkout.orderId);
    await verify(booking.id, user.id, checkout.orderId, balance.id);
    return { departure, user, booking, deposit, balance };
  }

  it("refunds each original payment on a traveller cancellation after both payments", async () => {
    const { user, booking, deposit, balance } = await fullyPaid();
    const quote = await createCancelQuote({ bookingId: booking.id, userId: user.id }, { clock });
    expect(quote.breakdown.refundPaise).toBe(1_200_000);
    const committed = await cancelBookingByTraveller({ bookingId: booking.id, userId: user.id, quoteId: quote.quote.id }, { clock });
    expect(committed.replayed).toBe(false);
    const replay = await cancelBookingByTraveller({ bookingId: booking.id, userId: user.id, quoteId: quote.quote.id }, { clock });
    expect(replay.replayed).toBe(true);
    await processOutboxBatch(50, { clock, provider: fake });
    const rows = await db.select().from(refunds).where(eq(refunds.bookingId, booking.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.state === "processed" && r.providerRefundId)).toBe(true);
    const byPayment = new Map(rows.map((r) => [r.paymentAttemptId, r.amountPaise]));
    const [depositAttempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.providerPaymentId, deposit.id));
    const [balanceAttempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.providerPaymentId, balance.id));
    expect(byPayment.get(depositAttempt.id)).toBe(360_000);
    expect(byPayment.get(balanceAttempt.id)).toBe(840_000);
    expect(fake.calls.filter((c) => c.op === "createRefund")).toHaveLength(2);
  });

  it("rejects an expired or stale cancellation quote", async () => {
    const { user, booking } = await fullyPaid();
    const quote = await createCancelQuote({ bookingId: booking.id, userId: user.id }, { clock });
    clock.advanceMinutes(11);
    await expect(cancelBookingByTraveller({ bookingId: booking.id, userId: user.id, quoteId: quote.quote.id }, { clock })).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
    expect((await bookingState(booking.id)).state).toBe("CONFIRMED");
  });

  it("keeps a timed-out refund pending and adopts the provider refund on retry without a second charge", async () => {
    const { user, booking } = await fullyPaid();
    const quote = await createCancelQuote({ bookingId: booking.id, userId: user.id }, { clock });
    await cancelBookingByTraveller({ bookingId: booking.id, userId: user.id, quoteId: quote.quote.id }, { clock });
    fake.failNext("createRefund", "timeout");
    await processOutboxBatch(50, { clock, provider: fake });
    let rows = await db.select().from(refunds).where(eq(refunds.bookingId, booking.id));
    expect(rows.filter((r) => r.state === "processing" && !r.providerRefundId)).toHaveLength(1);
    expect(rows.filter((r) => r.state === "processed")).toHaveLength(1);
    clock.advanceMinutes(10);
    await processOutboxBatch(50, { clock, provider: fake });
    rows = await db.select().from(refunds).where(eq(refunds.bookingId, booking.id));
    expect(rows.every((r) => r.state === "processed" && r.providerRefundId)).toBe(true);
    const totalRefunded = [...fake.refunds.values()].reduce((s, r) => s + r.amount, 0);
    expect(totalRefunded).toBe(1_200_000);
    expect(fake.refunds.size).toBe(2);
  });

  it("never refunds more than captured when a dashboard refund races the worker", async () => {
    const { user, booking, deposit } = await fullyPaid();
    fake.dashboardRefund(deposit.id, 360_000);
    const quote = await createCancelQuote({ bookingId: booking.id, userId: user.id }, { clock });
    await cancelBookingByTraveller({ bookingId: booking.id, userId: user.id, quoteId: quote.quote.id }, { clock });
    await processOutboxBatch(50, { clock, provider: fake });
    const rows = await db.select().from(refunds).where(eq(refunds.bookingId, booking.id));
    const [depositAttempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.providerPaymentId, deposit.id));
    const depositRefunds = rows.filter((r) => r.paymentAttemptId === depositAttempt.id);
    const processedOnDeposit = depositRefunds.filter((r) => r.state === "processed").reduce((s, r) => s + r.amountPaise, 0);
    expect(processedOnDeposit).toBe(360_000);
    expect(depositRefunds.some((r) => r.origin === "provider")).toBe(true);
    expect(depositRefunds.some((r) => r.state === "failed")).toBe(true);
    const providerTotal = [...fake.refunds.values()].filter((r) => r.payment_id === deposit.id).reduce((s, r) => s + r.amount, 0);
    expect(providerTotal).toBe(360_000);
    const alerts = await db.select().from(outbox).where(eq(outbox.kind, "alert.finance"));
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("keeps a failed refund visible and alerts finance", async () => {
    const { user, booking } = await fullyPaid();
    const quote = await createCancelQuote({ bookingId: booking.id, userId: user.id }, { clock });
    await cancelBookingByTraveller({ bookingId: booking.id, userId: user.id, quoteId: quote.quote.id }, { clock });
    fake.failNext("createRefund", "bad_request");
    await processOutboxBatch(50, { clock, provider: fake });
    const rows = await db.select().from(refunds).where(eq(refunds.bookingId, booking.id));
    expect(rows.some((r) => r.state === "failed")).toBe(true);
    const detail = await loadBookingDetail(booking.id);
    expect(detail?.booking.state).toBe("CANCELLED");
    await processOutboxBatch(50, { clock, provider: fake });
    const alertEmails = await db.select().from(emailDeliveries).where(eq(emailDeliveries.recipient, "ops@example.test"));
    expect(alertEmails.length).toBeGreaterThan(0);
  });
});
