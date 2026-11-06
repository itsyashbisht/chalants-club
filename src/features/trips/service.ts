import "@/lib/server-guard";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Clock } from "@/lib/clock";
import { getDb, type Db, type DbOrTx } from "@/lib/db/client";
import { withClockTx } from "@/lib/db/tx";
import { env } from "@/lib/env";
import { errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import type { EmailMessage } from "@/lib/email";
import { users } from "@/lib/db/core-schema";
import { bookings, ACTIVE_BOOKING_STATES } from "@/features/bookings/schema";
import { activeBookingCount, cancelDepartureBookings, completeDepartureBookings } from "@/features/bookings/service";
import { lockDeparture } from "@/features/bookings/locks";
import { enqueue } from "@/features/payments/outbox";
import { departures, departureTags, hosts, itineraryDays, policyVersions, trips, waitlist, hostAssignments } from "./schema";
import { formatDateRange } from "@/lib/time";

type Deps = { clock?: Clock; db?: Db };

export const tripInputSchema = z.object({
  slug: z.string().trim().min(3).max(60).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only"),
  title: z.string().trim().min(3).max(120),
  destination: z.string().trim().min(2).max(80),
  region: z.string().trim().min(2).max(80),
  summary: z.string().trim().min(10).max(300),
  description: z.string().trim().min(10).max(5000),
  heroImageUrl: z.string().url().optional().nullable(),
  heroImageAlt: z.string().max(200).optional().nullable(),
  heroImageCredit: z.string().max(200).optional().nullable(),
  durationDays: z.number().int().min(1).max(30),
  meetingPointArea: z.string().trim().min(2).max(200),
  roomPlan: z.string().trim().min(2).max(500),
  pace: z.string().trim().min(2).max(80),
  inclusions: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  extraCosts: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  optionalActivities: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  isPilot: z.boolean().default(true),
  days: z.array(z.object({ dayNumber: z.number().int().min(1), title: z.string().trim().min(1).max(120), description: z.string().trim().min(1).max(2000) })).default([]),
});

export const departureInputSchema = z.object({
  tripId: z.string().uuid(),
  hostId: z.string().uuid(),
  policyVersionId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  salesCloseAt: z.string().datetime({ offset: true }),
  capacity: z.number().int().min(1).max(60),
  minAge: z.number().int().min(18).max(99),
  maxAge: z.number().int().min(18).max(99),
  totalPaise: z.number().int().positive(),
  depositBps: z.number().int().min(1).max(9999),
  holdMinutes: z.number().int().min(5).max(120).default(15),
  reviewHours: z.number().int().min(1).max(240).default(48),
  balanceWindowHours: z.number().int().min(1).max(240).default(24),
  taxesNote: z.string().max(200).default("Prices are tax-inclusive."),
  tags: z.array(z.object({ question: z.enum(["q3", "q4", "q5", "q6"]), optionId: z.string().min(1), fact: z.string().trim().min(3).max(200) })).default([]),
});

export type TripInput = z.infer<typeof tripInputSchema>;
export type DepartureInput = z.infer<typeof departureInputSchema>;

export async function upsertTrip(input: TripInput, actorUserId: string, tripId?: string, deps: Deps = {}) {
  return withClockTx(async (tx, now) => {
    const { days, ...fields } = input;
    let id = tripId;
    if (id) {
      const [updated] = await tx.update(trips).set({ ...fields, updatedAt: now }).where(eq(trips.id, id)).returning();
      if (!updated) throw errors.notFound("Trip not found.");
      await tx.delete(itineraryDays).where(eq(itineraryDays.tripId, id));
    } else {
      const [created] = await tx.insert(trips).values({ ...fields, createdAt: now, updatedAt: now }).returning();
      id = created.id;
    }
    if (days.length) await tx.insert(itineraryDays).values(days.map((d) => ({ ...d, tripId: id! })));
    await audit(tx, { actorType: "user", actorUserId, operation: tripId ? "trip.updated" : "trip.created", entityType: "trip", entityId: id });
    return id;
  }, deps);
}

/** Price, policy, date or age changes bump the version so existing quotes must be re-reviewed. */
const VERSIONED_FIELDS: Array<keyof DepartureInput> = ["startDate", "endDate", "totalPaise", "depositBps", "policyVersionId", "minAge", "maxAge", "balanceWindowHours", "holdMinutes"];

export async function createDeparture(input: DepartureInput, actorUserId: string, deps: Deps = {}) {
  validateDepartureDates(input);
  return withClockTx(async (tx, now) => {
    const { tags, ...fields } = input;
    const [created] = await tx
      .insert(departures)
      .values({ ...fields, salesCloseAt: new Date(fields.salesCloseAt), status: "draft", createdAt: now, updatedAt: now })
      .returning();
    if (tags.length) await tx.insert(departureTags).values(tags.map((t) => ({ ...t, departureId: created.id })));
    await audit(tx, { actorType: "user", actorUserId, operation: "departure.created", entityType: "departure", entityId: created.id });
    return created;
  }, deps);
}

/** Edits are blocked when they would invalidate existing commitments (capacity below allocated seats, price changes after sales). */
export async function updateDeparture(departureId: string, input: DepartureInput, actorUserId: string, deps: Deps = {}) {
  validateDepartureDates(input);
  return withClockTx(async (tx, now) => {
    const current = await lockDeparture(tx, departureId);
    const allocated = await activeBookingCount(tx, departureId);
    if (input.capacity < allocated) throw errors.conflict("CAPACITY_BELOW_ALLOCATED", `Capacity cannot go below the ${allocated} seat(s) already allocated.`);
    const { tags, ...fields } = input;
    const changedVersioned = VERSIONED_FIELDS.some((k) => {
      const before = current[k as keyof typeof current];
      const after = fields[k as keyof typeof fields];
      const normalise = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
      return normalise(before) !== normalise(k === "salesCloseAt" ? new Date(String(after)) : after);
    });
    if (changedVersioned && allocated > 0 && (fields.totalPaise !== current.totalPaise || fields.depositBps !== current.depositBps)) {
      throw errors.conflict("PRICE_LOCKED", "Price cannot change while travellers hold seats. Create a new departure instead.");
    }
    const [updated] = await tx
      .update(departures)
      .set({ ...fields, salesCloseAt: new Date(fields.salesCloseAt), version: changedVersioned ? current.version + 1 : current.version, updatedAt: now })
      .where(eq(departures.id, departureId))
      .returning();
    await tx.delete(departureTags).where(eq(departureTags.departureId, departureId));
    if (tags.length) await tx.insert(departureTags).values(tags.map((t) => ({ ...t, departureId })));
    await audit(tx, { actorType: "user", actorUserId, operation: "departure.updated", entityType: "departure", entityId: departureId, metadata: { versionBumped: changedVersioned } });
    return updated;
  }, deps);
}

function validateDepartureDates(input: DepartureInput) {
  if (input.endDate < input.startDate) throw errors.invalid("End date must be on or after the start date.");
  if (input.maxAge < input.minAge) throw errors.invalid("Maximum age must be at least the minimum age.");
  const close = new Date(input.salesCloseAt);
  const start = new Date(`${input.startDate}T00:00:00+05:30`);
  const minimumLead = (input.reviewHours + input.balanceWindowHours + 24) * 3_600_000;
  if (start.getTime() - close.getTime() < minimumLead) {
    throw errors.invalid(`Sales must close at least ${Math.ceil(minimumLead / 3_600_000)} hours before departure to allow review and balance collection.`);
  }
}

export type DepartureAction = "publish" | "close" | "cancel" | "complete";

/** Guarded status transitions with audit. Cancelling a departure cancels and refunds every active booking. */
export async function setDepartureStatus(input: { departureId: string; action: DepartureAction; actorUserId: string; reason: string; expectedVersion: number }, deps: Deps = {}) {
  return withClockTx(async (tx, now) => {
    const departure = await lockDeparture(tx, input.departureId);
    if (departure.version !== input.expectedVersion) throw errors.conflict("STALE_VERSION", "The departure changed since you loaded it. Reload and try again.");
    const transitions: Record<DepartureAction, { from: Array<typeof departure.status>; to: typeof departure.status }> = {
      publish: { from: ["draft", "closed"], to: "published" },
      close: { from: ["published"], to: "closed" },
      cancel: { from: ["draft", "published", "closed"], to: "cancelled" },
      complete: { from: ["closed", "published"], to: "completed" },
    };
    const t = transitions[input.action];
    if (!t.from.includes(departure.status)) throw errors.conflict("WRONG_STAGE", `Cannot ${input.action} a ${departure.status} departure.`);
    if (input.action === "publish") {
      const [trip] = await tx.select().from(trips).where(eq(trips.id, departure.tripId)).limit(1);
      if (!trip) throw errors.conflict("INCOMPLETE", "Trip missing.");
      if (departure.salesCloseAt.getTime() <= now.getTime()) throw errors.conflict("SALES_CLOSED", "Sales close time is in the past.");
    }
    if (input.action === "complete" && now.getTime() < new Date(`${departure.endDate}T00:00:00+05:30`).getTime()) {
      throw errors.conflict("NOT_RETURNED", "A departure can be completed only after its end date.");
    }
    let affected = 0;
    if (input.action === "cancel") affected = (await cancelDepartureBookings(tx, departure, input.actorUserId, input.reason, now)).length;
    if (input.action === "complete") affected = await completeDepartureBookings(tx, departure.id, now);
    const [updated] = await tx.update(departures).set({ status: t.to, updatedAt: now }).where(eq(departures.id, departure.id)).returning();
    await audit(tx, { actorType: "user", actorUserId: input.actorUserId, operation: `departure.${input.action}`, entityType: "departure", entityId: departure.id, reason: input.reason, metadata: { affectedBookings: affected } });
    return { departure: updated, affected };
  }, deps);
}

export const waitlistInputSchema = z.object({
  departureId: z.string().uuid(),
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(120).optional(),
  consent: z.literal(true),
});

/** Records interest in a departure. Returns the same acknowledgement whether or not the entry already existed. */
export async function joinWaitlist(input: z.infer<typeof waitlistInputSchema>, userId: string | null, deps: Deps = {}) {
  return withClockTx(async (tx, now) => {
    const [departure] = await tx.select().from(departures).where(eq(departures.id, input.departureId)).limit(1);
    if (!departure || departure.status !== "published") throw errors.notFound("Departure not found.");
    const [inserted] = await tx
      .insert(waitlist)
      .values({ departureId: departure.id, email: input.email.toLowerCase(), name: input.name ?? null, userId, consentAt: now, createdAt: now })
      .onConflictDoNothing()
      .returning();
    if (inserted) await enqueue(tx, "email.waitlist", `email.waitlist:${inserted.id}`, { waitlistId: inserted.id });
    return { acknowledged: true };
  }, deps);
}

export async function buildWaitlistEmail(payload: Record<string, unknown>, db: DbOrTx): Promise<EmailMessage | null> {
  const id = typeof payload.waitlistId === "string" ? payload.waitlistId : null;
  if (!id) return null;
  const [row] = await db
    .select({ email: waitlist.email, title: trips.title, startDate: departures.startDate, endDate: departures.endDate })
    .from(waitlist)
    .innerJoin(departures, eq(waitlist.departureId, departures.id))
    .innerJoin(trips, eq(departures.tripId, trips.id))
    .where(eq(waitlist.id, id))
    .limit(1);
  if (!row) return null;
  const e = env();
  return {
    to: row.email,
    idempotencyKey: `email.waitlist:${id}`,
    subject: `You're on the waitlist · ${row.title}`,
    text: `Thanks for your interest in ${row.title} (${formatDateRange(row.startDate, row.endDate)}). If a seat opens, we'll email you an invitation to book through the usual steps. You can ask us to remove you any time at ${e.SUPPORT_EMAIL}.\n\n${e.OPERATOR_NAME}`,
  };
}

// ---- Admin read models

export async function listDeparturesForAdmin(db: DbOrTx = getDb()) {
  return db
    .select({ departure: departures, trip: { title: trips.title, slug: trips.slug, destination: trips.destination }, host: { name: hosts.name } })
    .from(departures)
    .innerJoin(trips, eq(departures.tripId, trips.id))
    .innerJoin(hosts, eq(departures.hostId, hosts.id))
    .orderBy(desc(departures.startDate));
}

export async function getDepartureAdmin(departureId: string, db: DbOrTx = getDb()) {
  const [row] = await db
    .select({ departure: departures, trip: trips, host: hosts, policy: policyVersions })
    .from(departures)
    .innerJoin(trips, eq(departures.tripId, trips.id))
    .innerJoin(hosts, eq(departures.hostId, hosts.id))
    .innerJoin(policyVersions, eq(departures.policyVersionId, policyVersions.id))
    .where(eq(departures.id, departureId))
    .limit(1);
  if (!row) return null;
  const [roster, waitlistRows, tags, allocated] = await Promise.all([
    db
      .select({ booking: { id: bookings.id, reference: bookings.reference, state: bookings.state, createdAt: bookings.createdAt, travellerAge: bookings.travellerAge }, traveller: { name: users.name, email: users.email } })
      .from(bookings)
      .innerJoin(users, eq(bookings.ownerId, users.id))
      .where(eq(bookings.departureId, departureId))
      .orderBy(asc(bookings.createdAt)),
    db.select().from(waitlist).where(eq(waitlist.departureId, departureId)).orderBy(asc(waitlist.createdAt)),
    db.select().from(departureTags).where(eq(departureTags.departureId, departureId)),
    activeBookingCount(db, departureId),
  ]);
  return { ...row, roster, waitlist: waitlistRows, tags, allocated };
}

export async function listTripsForAdmin(db: DbOrTx = getDb()) {
  return db.select().from(trips).orderBy(asc(trips.title));
}

export async function listHosts(db: DbOrTx = getDb()) {
  return db.select().from(hosts).orderBy(asc(hosts.name));
}

export async function listPolicyVersions(db: DbOrTx = getDb()) {
  return db.select().from(policyVersions).orderBy(asc(policyVersions.name), desc(policyVersions.version));
}

/** Departures a host user is assigned to, with confirmed attendees only. */
export async function hostDepartures(userId: string, db: DbOrTx = getDb()) {
  return db
    .select({ departure: departures, trip: { title: trips.title } })
    .from(hostAssignments)
    .innerJoin(departures, eq(hostAssignments.departureId, departures.id))
    .innerJoin(trips, eq(departures.tripId, trips.id))
    .where(and(eq(hostAssignments.userId, userId), inArray(departures.status, ["published", "closed", "completed"])))
    .orderBy(asc(departures.startDate));
}

export { ACTIVE_BOOKING_STATES };
