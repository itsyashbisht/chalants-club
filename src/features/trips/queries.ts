import "@/lib/server-guard";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/lib/db/client";
import { departures, departureTags, hosts, itineraryDays, policyVersions, trips, waitlist } from "./schema";

const seatsLeftSql = sql<number>`(${departures.capacity} - (select count(*) from bookings b where b.departure_id = ${departures.id} and b.state in ('HELD','UNDER_REVIEW','BALANCE_DUE','CONFIRMED')))::int`;

const cardSelection = {
  id: departures.id,
  status: departures.status,
  startDate: departures.startDate,
  endDate: departures.endDate,
  salesCloseAt: departures.salesCloseAt,
  capacity: departures.capacity,
  seatsLeft: seatsLeftSql,
  minAge: departures.minAge,
  maxAge: departures.maxAge,
  totalPaise: departures.totalPaise,
  depositBps: departures.depositBps,
  holdMinutes: departures.holdMinutes,
  reviewHours: departures.reviewHours,
  balanceWindowHours: departures.balanceWindowHours,
  taxesNote: departures.taxesNote,
  version: departures.version,
  policyVersionId: departures.policyVersionId,
  isPilotFixture: departures.isPilotFixture,
  trip: {
    id: trips.id,
    slug: trips.slug,
    title: trips.title,
    destination: trips.destination,
    region: trips.region,
    summary: trips.summary,
    durationDays: trips.durationDays,
    pace: trips.pace,
    heroImageUrl: trips.heroImageUrl,
    heroImageAlt: trips.heroImageAlt,
    isPilot: trips.isPilot,
  },
  host: { id: hosts.id, name: hosts.name },
};

export type DepartureCard = Awaited<ReturnType<typeof listOpenDepartures>>[number];

function todayIst(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Published departures that have not started yet, optionally filtered. Sold-out departures are included (waitlist). */
export async function listOpenDepartures(filters: { destination?: string; from?: string; to?: string } = {}, db: DbOrTx = getDb()) {
  const conditions = [eq(departures.status, "published"), gte(departures.startDate, filters.from ?? todayIst())];
  if (filters.to) conditions.push(lte(departures.startDate, filters.to));
  if (filters.destination) conditions.push(eq(trips.destination, filters.destination));
  return db
    .select(cardSelection)
    .from(departures)
    .innerJoin(trips, eq(departures.tripId, trips.id))
    .innerJoin(hosts, eq(departures.hostId, hosts.id))
    .where(and(...conditions))
    .orderBy(asc(departures.startDate), asc(departures.id));
}

export async function listDestinations(db: DbOrTx = getDb()): Promise<string[]> {
  const rows = await db
    .selectDistinct({ destination: trips.destination })
    .from(departures)
    .innerJoin(trips, eq(departures.tripId, trips.id))
    .where(and(eq(departures.status, "published"), gte(departures.startDate, todayIst())))
    .orderBy(asc(trips.destination));
  return rows.map((r) => r.destination);
}

export async function getTripBySlug(slug: string, db: DbOrTx = getDb()) {
  const [trip] = await db.select().from(trips).where(eq(trips.slug, slug)).limit(1);
  if (!trip) return null;
  const [days, departureRows] = await Promise.all([
    db.select().from(itineraryDays).where(eq(itineraryDays.tripId, trip.id)).orderBy(asc(itineraryDays.dayNumber)),
    db
      .select({ ...cardSelection, hostBio: hosts.bio, hostPhotoUrl: hosts.photoUrl, policyRules: policyVersions.rules, policyName: policyVersions.name, policyVersion: policyVersions.version })
      .from(departures)
      .innerJoin(trips, eq(departures.tripId, trips.id))
      .innerJoin(hosts, eq(departures.hostId, hosts.id))
      .innerJoin(policyVersions, eq(departures.policyVersionId, policyVersions.id))
      .where(and(eq(departures.tripId, trip.id), inArray(departures.status, ["published", "closed"]), gte(departures.startDate, todayIst())))
      .orderBy(asc(departures.startDate)),
  ]);
  return { trip, days, departures: departureRows };
}

export type DepartureDetail = NonNullable<Awaited<ReturnType<typeof getDepartureDetail>>>;

/** Everything the booking page and quote step need for one departure. */
export async function getDepartureDetail(departureId: string, db: DbOrTx = getDb()) {
  const [row] = await db
    .select({ ...cardSelection, hostBio: hosts.bio, hostPhotoUrl: hosts.photoUrl, policyRules: policyVersions.rules, policyName: policyVersions.name, policyVersion: policyVersions.version })
    .from(departures)
    .innerJoin(trips, eq(departures.tripId, trips.id))
    .innerJoin(hosts, eq(departures.hostId, hosts.id))
    .innerJoin(policyVersions, eq(departures.policyVersionId, policyVersions.id))
    .where(eq(departures.id, departureId))
    .limit(1);
  if (!row) return null;
  const [tripRow] = await db.select().from(trips).where(eq(trips.id, row.trip.id)).limit(1);
  const [days, tags] = await Promise.all([
    db.select().from(itineraryDays).where(eq(itineraryDays.tripId, row.trip.id)).orderBy(asc(itineraryDays.dayNumber)),
    db.select().from(departureTags).where(eq(departureTags.departureId, departureId)),
  ]);
  return { ...row, tripFull: tripRow, days, tags };
}

/** Open departures with tags for the quiz ranker. */
export async function listRankableDepartures(now = new Date(), db: DbOrTx = getDb()) {
  const rows = await db
    .select(cardSelection)
    .from(departures)
    .innerJoin(trips, eq(departures.tripId, trips.id))
    .innerJoin(hosts, eq(departures.hostId, hosts.id))
    .where(and(eq(departures.status, "published"), gte(departures.salesCloseAt, now), gte(departures.startDate, todayIst(now))))
    .orderBy(asc(departures.startDate));
  if (rows.length === 0) return [];
  const tags = await db.select().from(departureTags).where(inArray(departureTags.departureId, rows.map((r) => r.id)));
  return rows.map((r) => ({ ...r, tags: tags.filter((t) => t.departureId === r.id).map((t) => ({ question: t.question, optionId: t.optionId, fact: t.fact })) }));
}

export async function waitlistCount(departureId: string, db: DbOrTx = getDb()): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(waitlist).where(eq(waitlist.departureId, departureId));
  return Number(row?.n ?? 0);
}
