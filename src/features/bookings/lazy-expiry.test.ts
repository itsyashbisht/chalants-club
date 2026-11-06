import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, truncateAll, closeDb } from "@/test/db";
import { installFakeProvider, makeDeparture, makeUser } from "@/test/fixtures";
import { fixedClock } from "@/lib/clock";
import { createHold, expireBookingIfDue } from "./service";
import { bookings } from "./schema";
import { listOpenDepartures } from "@/features/trips/queries";
import { createCheckoutOrder } from "@/features/payments/orders";

const START = new Date("2026-11-06T09:00:00.000Z");
const attestations = { single: true, conduct: true, policy: true } as const;
let clock: ReturnType<typeof fixedClock>;

beforeEach(async () => {
  await truncateAll();
  installFakeProvider();
  clock = fixedClock(START);
});

afterAll(async () => {
  await closeDb();
});

describe("request-driven expiry (no scheduler)", () => {
  it("frees a lapsed hold for the next traveller without the tick running", async () => {
    const { departure } = await makeDeparture(START, { capacity: 1 });
    const first = await makeUser();
    const second = await makeUser();
    const held = await createHold({ userId: first.id, departureId: departure.id, quoteVersion: departure.version, policyVersionId: departure.policyVersionId, travellerAge: 30, quiz: null, attestations }, { clock });
    await expect(createHold({ userId: second.id, departureId: departure.id, quoteVersion: departure.version, policyVersionId: departure.policyVersionId, travellerAge: 30, quiz: null, attestations }, { clock })).rejects.toMatchObject({ code: "SOLD_OUT" });
    clock.advanceMinutes(16);
    const result = await createHold({ userId: second.id, departureId: departure.id, quoteVersion: departure.version, policyVersionId: departure.policyVersionId, travellerAge: 30, quiz: null, attestations }, { clock });
    expect(result.created).toBe(true);
    const [old] = await db.select({ state: bookings.state }).from(bookings).where(eq(bookings.id, held.booking.id));
    expect(old.state).toBe("EXPIRED");
  });

  it("stops counting a lapsed hold in public seat availability before anything closes it", async () => {
    const { departure } = await makeDeparture(new Date(), { capacity: 2 });
    const user = await makeUser();
    const past = fixedClock(new Date(Date.now() - 60 * 60_000));
    await createHold({ userId: user.id, departureId: departure.id, quoteVersion: departure.version, policyVersionId: departure.policyVersionId, travellerAge: 30, quiz: null, attestations }, { clock: past });
    const [card] = await listOpenDepartures();
    expect(card.seatsLeft).toBe(2);
  });

  it("expires a booking when its owner loads it and refuses a deposit order afterwards", async () => {
    const { departure } = await makeDeparture(START);
    const user = await makeUser();
    const { booking } = await createHold({ userId: user.id, departureId: departure.id, quoteVersion: departure.version, policyVersionId: departure.policyVersionId, travellerAge: 30, quiz: null, attestations }, { clock });
    expect(await expireBookingIfDue(booking.id, { clock })).toBe(false);
    clock.advanceMinutes(20);
    expect(await expireBookingIfDue(booking.id, { clock })).toBe(true);
    expect(await expireBookingIfDue(booking.id, { clock })).toBe(false);
    await expect(createCheckoutOrder({ bookingId: booking.id, kind: "deposit", userId: user.id }, { clock })).rejects.toMatchObject({ code: "WRONG_STAGE" });
  });
});
