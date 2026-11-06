import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, truncateAll, closeDb } from "@/test/db";
import { deliverWebhook, installFakeProvider, makeDeparture, makeUser, paymentEventBody, PREVIOUS_WEBHOOK_SECRET, WEBHOOK_SECRET } from "@/test/fixtures";
import { fixedClock } from "@/lib/clock";
import { signWebhook } from "@/lib/razorpay/signature";
import type { FakePaymentProvider } from "@/lib/razorpay/fake";
import { ingestWebhook, processInboxBatch } from "./webhooks";
import { webhookInbox, outbox } from "./schema";
import { createHold } from "@/features/bookings/service";
import { createCheckoutOrder } from "./orders";
import { runTick } from "@/lib/jobs/tick";
import { jobLeases, emailDeliveries } from "@/lib/db/core-schema";
import { bookings } from "@/features/bookings/schema";

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

describe("webhook acceptance", () => {
  it("rejects invalid signatures and altered bytes, accepts the rotated secret, stores each event once", async () => {
    const payment = { id: "pay_x", order_id: "order_x", amount: 100, currency: "INR", status: "captured" as const, captured: true, method: "upi", email: null, error_code: null, error_description: null, created_at: 1 };
    const body = paymentEventBody("payment.captured", payment);
    await expect(ingestWebhook({ rawBody: body, signature: "deadbeef", eventId: "e1", mode: "test", secrets: [WEBHOOK_SECRET] })).rejects.toMatchObject({ status: 401 });
    const altered = Buffer.from(body.toString("utf8").replace('"amount":100', '"amount":200'));
    await expect(ingestWebhook({ rawBody: altered, signature: signWebhook(WEBHOOK_SECRET, body), eventId: "e1", mode: "test", secrets: [WEBHOOK_SECRET] })).rejects.toMatchObject({ status: 401 });
    const first = await ingestWebhook({ rawBody: body, signature: signWebhook(PREVIOUS_WEBHOOK_SECRET, body), eventId: "e1", mode: "test", secrets: [WEBHOOK_SECRET, PREVIOUS_WEBHOOK_SECRET] });
    expect(first.duplicate).toBe(false);
    const second = await ingestWebhook({ rawBody: body, signature: signWebhook(WEBHOOK_SECRET, body), eventId: "e1", mode: "test", secrets: [WEBHOOK_SECRET] });
    expect(second.duplicate).toBe(true);
    expect(second.inboxId).toBe(first.inboxId);
    expect(await db.select().from(webhookInbox)).toHaveLength(1);
  });

  it("rejects malformed events and oversized bodies", async () => {
    const junk = Buffer.from(JSON.stringify({ hello: "world" }));
    await expect(ingestWebhook({ rawBody: junk, signature: signWebhook(WEBHOOK_SECRET, junk), eventId: "e2", mode: "test", secrets: [WEBHOOK_SECRET] })).rejects.toMatchObject({ status: 422 });
    const big = Buffer.alloc(300 * 1024, 32);
    await expect(ingestWebhook({ rawBody: big, signature: signWebhook(WEBHOOK_SECRET, big), eventId: "e3", mode: "test", secrets: [WEBHOOK_SECRET] })).rejects.toMatchObject({ status: 422 });
  });

  it("quarantines a captured payment with no matching order and alerts finance", async () => {
    const payment = { id: "pay_orphan", order_id: "order_unknown", amount: 100, currency: "INR", status: "captured" as const, captured: true, method: "upi", email: null, error_code: null, error_description: null, created_at: 1 };
    await deliverWebhook({ body: paymentEventBody("payment.captured", payment), provider: fake, clock });
    const alerts = await db.select().from(outbox).where(eq(outbox.kind, "alert.finance"));
    expect(alerts).toHaveLength(1);
    const [item] = await db.select().from(webhookInbox);
    expect(item.status).toBe("processed");
  });

  it("quarantines an amount mismatch without applying it", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const { booking } = await createHold({ userId: user.id, departureId: departure.id, quoteVersion: departure.version, policyVersionId: departure.policyVersionId, travellerAge: 30, quiz: null, attestations: { single: true, conduct: true, policy: true } }, { clock });
    const order = await createCheckoutOrder({ bookingId: booking.id, kind: "deposit", userId: user.id }, { clock, provider: fake });
    if (order.status !== "ready") throw new Error("expected order");
    const payment = fake.capture(order.checkout.orderId, { amount: 1 });
    await deliverWebhook({ body: paymentEventBody("payment.captured", payment), provider: fake, clock });
    const [row] = await db.select({ state: bookings.state }).from(bookings).where(eq(bookings.id, booking.id));
    expect(row.state).toBe("HELD");
    const alerts = await db.select().from(outbox).where(eq(outbox.kind, "alert.finance"));
    expect(alerts).toHaveLength(1);
  });
});

describe("scheduler tick", () => {
  it("takes a lease, drains stored events and delivers the outbox; a concurrent tick is skipped", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const { booking } = await createHold({ userId: user.id, departureId: departure.id, quoteVersion: departure.version, policyVersionId: departure.policyVersionId, travellerAge: 30, quiz: null, attestations: { single: true, conduct: true, policy: true } }, { clock });
    const order = await createCheckoutOrder({ bookingId: booking.id, kind: "deposit", userId: user.id }, { clock, provider: fake });
    if (order.status !== "ready") throw new Error("expected order");
    const payment = fake.capture(order.checkout.orderId);
    await deliverWebhook({ body: paymentEventBody("payment.captured", payment), provider: fake, clock, process: false });
    const pending = await processInboxBatch(10, { provider: fake, clock });
    expect(pending.processed).toBe(1);
    const [tick, concurrent] = await Promise.all([runTick({ clock, provider: fake }), runTick({ clock, provider: fake })]);
    expect([tick.leased, concurrent.leased].sort()).toEqual([false, true]);
    const winner = tick.leased ? tick : concurrent;
    expect(winner.outbox?.delivered).toBeGreaterThan(0);
    const emails = await db.select().from(emailDeliveries);
    expect(emails.some((e) => e.subject.startsWith("Deposit received"))).toBe(true);
    const [lease] = await db.select().from(jobLeases);
    expect(lease.lastRunAt).not.toBeNull();
  });

  it("reconciles a payable order near hold expiry so a lost capture is applied, not refunded", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const { booking } = await createHold({ userId: user.id, departureId: departure.id, quoteVersion: departure.version, policyVersionId: departure.policyVersionId, travellerAge: 30, quiz: null, attestations: { single: true, conduct: true, policy: true } }, { clock });
    const order = await createCheckoutOrder({ bookingId: booking.id, kind: "deposit", userId: user.id }, { clock, provider: fake });
    if (order.status !== "ready") throw new Error("expected order");
    fake.capture(order.checkout.orderId); // no callback, no webhook
    clock.advanceMinutes(13);
    const result = await runTick({ clock, provider: fake });
    expect(result.reconciledOrders?.captured).toBe(1);
    const [row] = await db.select({ state: bookings.state }).from(bookings).where(eq(bookings.id, booking.id));
    expect(row.state).toBe("UNDER_REVIEW");
  });
});
