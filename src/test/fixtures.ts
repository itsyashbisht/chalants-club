import { db } from "./db";
import { users, userRoles } from "@/lib/db/core-schema";
import { departures, departureTags, hosts, itineraryDays, policyVersions, trips } from "@/features/trips/schema";
import { PILOT_POLICY_RULES } from "@/features/bookings/policy";
import { FakePaymentProvider } from "@/lib/razorpay/fake";
import { setPaymentProvider } from "@/lib/razorpay/client";
import { signWebhook } from "@/lib/razorpay/signature";
import { ingestWebhook, processInboxItem } from "@/features/payments/webhooks";
import type { ProviderPayment, ProviderRefund } from "@/lib/razorpay/provider";
import type { Clock } from "@/lib/clock";
import { shortToken } from "@/lib/ids";

export const WEBHOOK_SECRET = "test_webhook_secret";
export const PREVIOUS_WEBHOOK_SECRET = "previous_webhook_secret";

export async function makeUser(email = `${shortToken(8)}@example.test`, roles: Array<"host" | "reviewer" | "finance" | "operator"> = []) {
  const [user] = await db.insert(users).values({ clerkUserId: `test:${email}`, email, name: email.split("@")[0], mfaEnabled: true }).returning();
  if (roles.length) await db.insert(userRoles).values(roles.map((role) => ({ userId: user.id, role })));
  return user;
}

export async function makePolicy() {
  const [policy] = await db.insert(policyVersions).values({ name: "pilot", version: 1, rules: PILOT_POLICY_RULES, isPilotFixture: true }).onConflictDoNothing().returning();
  if (policy) return policy;
  const [existing] = await db.select().from(policyVersions).limit(1);
  return existing;
}

export async function makeHost() {
  const [host] = await db.insert(hosts).values({ name: "Asha (test host)", bio: "Test host fixture." }).returning();
  return host;
}

export async function makeTrip(slug = `trip-${shortToken(6)}`) {
  const [trip] = await db
    .insert(trips)
    .values({
      slug,
      title: "Udaipur lakes long weekend",
      destination: "Udaipur",
      region: "Rajasthan",
      summary: "Three days around the lakes with a small group of solo travellers.",
      description: "Fixture trip for tests.",
      durationDays: 3,
      meetingPointArea: "Near Jagdish Temple, Udaipur",
      roomPlan: "Twin-share rooms, same-gender by default.",
      pace: "Relaxed mornings, one planned activity per day.",
      inclusions: ["2 nights stay", "Breakfast"],
      extraCosts: ["Flights to Udaipur"],
      isPilot: true,
    })
    .returning();
  await db.insert(itineraryDays).values([
    { tripId: trip.id, dayNumber: 1, title: "Arrive and meet", description: "Chai on the ghats." },
    { tripId: trip.id, dayNumber: 2, title: "Old city and food", description: "Street-food walk." },
  ]);
  return trip;
}

export type DepartureOverrides = Partial<{
  capacity: number;
  totalPaise: number;
  depositBps: number;
  minAge: number;
  maxAge: number;
  holdMinutes: number;
  reviewHours: number;
  balanceWindowHours: number;
  daysUntilStart: number;
  status: "draft" | "published" | "closed";
}>;

/** Published departure 30 days out with a 3-day sales buffer. Defaults: 1 seat, ₹12,000 total, 30% deposit. */
export async function makeDeparture(now: Date, overrides: DepartureOverrides = {}) {
  const policy = await makePolicy();
  const host = await makeHost();
  const trip = await makeTrip();
  const daysUntilStart = overrides.daysUntilStart ?? 30;
  const start = new Date(now.getTime() + daysUntilStart * 86_400_000);
  const end = new Date(start.getTime() + 2 * 86_400_000);
  const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
  const [departure] = await db
    .insert(departures)
    .values({
      tripId: trip.id,
      hostId: host.id,
      policyVersionId: policy.id,
      status: overrides.status ?? "published",
      startDate: toDateStr(start),
      endDate: toDateStr(end),
      salesCloseAt: new Date(start.getTime() - 5 * 86_400_000),
      capacity: overrides.capacity ?? 1,
      minAge: overrides.minAge ?? 24,
      maxAge: overrides.maxAge ?? 38,
      totalPaise: overrides.totalPaise ?? 1_200_000,
      depositBps: overrides.depositBps ?? 3_000,
      holdMinutes: overrides.holdMinutes ?? 15,
      reviewHours: overrides.reviewHours ?? 48,
      balanceWindowHours: overrides.balanceWindowHours ?? 24,
      isPilotFixture: true,
    })
    .returning();
  await db.insert(departureTags).values([
    { departureId: departure.id, question: "q3", optionId: "short_walk_viewpoint", fact: "Day 2 starts with a short walk to the Ambrai Ghat viewpoint" },
    { departureId: departure.id, question: "q4", optionId: "local_food_trail", fact: "Day 2 afternoon street-food walk in the old city" },
    { departureId: departure.id, question: "q6", optionId: "quiet_balcony", fact: "Evenings end on the haveli rooftop" },
  ]);
  return { departure, trip, host, policy };
}

export function installFakeProvider(): FakePaymentProvider {
  const fake = new FakePaymentProvider();
  setPaymentProvider(fake);
  return fake;
}

export function paymentEventBody(event: string, payment: ProviderPayment, extra: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      entity: "event",
      account_id: "acc_test",
      event,
      created_at: Math.floor(Date.now() / 1000),
      payload: { payment: { entity: payment }, ...extra },
    }),
  );
}

export function refundEventBody(event: string, refund: ProviderRefund): Buffer {
  return Buffer.from(JSON.stringify({ entity: "event", account_id: "acc_test", event, created_at: Math.floor(Date.now() / 1000), payload: { refund: { entity: refund } } }));
}

/** Delivers a signed webhook end-to-end: ingest (durable) then process. */
export async function deliverWebhook(opts: { body: Buffer; eventId?: string; secret?: string; provider: FakePaymentProvider; clock?: Clock; process?: boolean }) {
  const secret = opts.secret ?? WEBHOOK_SECRET;
  const ingested = await ingestWebhook({
    rawBody: opts.body,
    signature: signWebhook(secret, opts.body),
    eventId: opts.eventId ?? `evt_${shortToken(10)}`,
    mode: "test",
    secrets: [WEBHOOK_SECRET, PREVIOUS_WEBHOOK_SECRET],
  });
  if (opts.process !== false) await processInboxItem(ingested.inboxId, { provider: opts.provider, clock: opts.clock });
  return ingested;
}
