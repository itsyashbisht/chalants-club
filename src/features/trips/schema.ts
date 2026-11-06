import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/lib/db/core-schema";

export const departureStatusEnum = pgEnum("departure_status", ["draft", "published", "closed", "cancelled", "completed"]);
export type DepartureStatus = (typeof departureStatusEnum.enumValues)[number];

export type PolicyTier = { minDaysBefore: number; refundBps: number };
export type PolicyRules = {
  kind: "tiered";
  /** Descending by minDaysBefore. The first tier whose minDaysBefore <= days before departure applies. */
  tiers: PolicyTier[];
  /** Share refunded when the balance window lapses after approval. */
  balanceTimeoutRefundBps: number;
  rounding: "nearest";
  summary: string;
  examples: string[];
};

export const policyVersions = pgTable(
  "policy_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    version: integer().notNull(),
    rules: jsonb().$type<PolicyRules>().notNull(),
    isPilotFixture: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("policy_versions_name_version_idx").on(t.name, t.version)],
);

export const hosts = pgTable("hosts", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  bio: text().notNull(),
  photoUrl: text(),
  userId: uuid().references(() => users.id),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const trips = pgTable(
  "trips",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull(),
    title: text().notNull(),
    destination: text().notNull(),
    region: text().notNull(),
    summary: text().notNull(),
    description: text().notNull(),
    heroImageUrl: text(),
    heroImageAlt: text(),
    heroImageCredit: text(),
    galleryUrls: jsonb().$type<Array<{ src: string; alt: string; credit: string }>>().notNull().default([]),
    durationDays: integer().notNull(),
    meetingPointArea: text().notNull(),
    roomPlan: text().notNull(),
    pace: text().notNull(),
    inclusions: jsonb().$type<string[]>().notNull().default([]),
    extraCosts: jsonb().$type<string[]>().notNull().default([]),
    optionalActivities: jsonb().$type<string[]>().notNull().default([]),
    isPilot: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("trips_slug_idx").on(t.slug), check("trips_duration_positive", sql`${t.durationDays} > 0`)],
);

export const itineraryDays = pgTable(
  "itinerary_days",
  {
    id: uuid().primaryKey().defaultRandom(),
    tripId: uuid()
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    dayNumber: integer().notNull(),
    title: text().notNull(),
    description: text().notNull(),
  },
  (t) => [uniqueIndex("itinerary_days_trip_day_idx").on(t.tripId, t.dayNumber)],
);

export const departures = pgTable(
  "departures",
  {
    id: uuid().primaryKey().defaultRandom(),
    tripId: uuid()
      .notNull()
      .references(() => trips.id),
    hostId: uuid()
      .notNull()
      .references(() => hosts.id),
    policyVersionId: uuid()
      .notNull()
      .references(() => policyVersions.id),
    status: departureStatusEnum().notNull().default("draft"),
    startDate: date().notNull(),
    endDate: date().notNull(),
    salesCloseAt: timestamp({ withTimezone: true }).notNull(),
    capacity: integer().notNull(),
    minAge: integer().notNull(),
    maxAge: integer().notNull(),
    totalPaise: integer().notNull(),
    depositBps: integer().notNull(),
    holdMinutes: integer().notNull().default(15),
    reviewHours: integer().notNull().default(48),
    balanceWindowHours: integer().notNull().default(24),
    taxesNote: text().notNull().default("Prices are tax-inclusive."),
    /** Bumped on every price/policy/date change; a booking quote must match. */
    version: integer().notNull().default(1),
    isPilotFixture: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("departures_trip_idx").on(t.tripId),
    index("departures_status_start_idx").on(t.status, t.startDate),
    check("departures_capacity_positive", sql`${t.capacity} > 0`),
    check("departures_age_range", sql`${t.minAge} >= 18 and ${t.maxAge} >= ${t.minAge}`),
    check("departures_total_positive", sql`${t.totalPaise} > 0`),
    check("departures_deposit_bps_range", sql`${t.depositBps} between 1 and 9999`),
    check("departures_dates_ordered", sql`${t.endDate} >= ${t.startDate}`),
    check("departures_windows_positive", sql`${t.holdMinutes} > 0 and ${t.reviewHours} > 0 and ${t.balanceWindowHours} > 0`),
  ],
);

/** Matchable itinerary tag with the displayable fact that backs it (e.g. q4 → local_food_trail → "Day 2: street-food walk in the old city"). */
export const departureTags = pgTable(
  "departure_tags",
  {
    id: uuid().primaryKey().defaultRandom(),
    departureId: uuid()
      .notNull()
      .references(() => departures.id, { onDelete: "cascade" }),
    question: text().notNull(),
    optionId: text().notNull(),
    fact: text().notNull(),
  },
  (t) => [uniqueIndex("departure_tags_unique_idx").on(t.departureId, t.question, t.optionId)],
);

export const hostAssignments = pgTable(
  "host_assignments",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    departureId: uuid()
      .notNull()
      .references(() => departures.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("host_assignments_unique_idx").on(t.userId, t.departureId)],
);

export const waitlist = pgTable(
  "waitlist",
  {
    id: uuid().primaryKey().defaultRandom(),
    departureId: uuid()
      .notNull()
      .references(() => departures.id, { onDelete: "cascade" }),
    email: text().notNull(),
    name: text(),
    userId: uuid().references(() => users.id),
    consentAt: timestamp({ withTimezone: true }).notNull(),
    invitedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("waitlist_departure_email_idx").on(t.departureId, t.email)],
);
