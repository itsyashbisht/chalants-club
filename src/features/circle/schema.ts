import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "@/lib/db/core-schema";
import { departures } from "@/features/trips/schema";
import { bookings } from "@/features/bookings/schema";

export const circlePreferences = pgTable(
  "circle_preferences",
  {
    id: uuid().primaryKey().defaultRandom(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    departureId: uuid()
      .notNull()
      .references(() => departures.id),
    /** Q2 welcome preference shared with the host, opt-in. */
    shareWelcomePreference: boolean().notNull().default(false),
    welcomePreferenceOptionId: text(),
    /** Q7 rotation preference shared with the host, opt-in. */
    shareRotationPreference: boolean().notNull().default(false),
    rotationPreferenceOptionId: text(),
    intro: text(),
    contactShareRevokedAt: timestamp({ withTimezone: true }),
    attended: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("circle_preferences_booking_idx").on(t.bookingId), index("circle_preferences_departure_idx").on(t.departureId)],
);

export const circleTracks = pgTable(
  "circle_tracks",
  {
    id: uuid().primaryKey().defaultRandom(),
    departureId: uuid()
      .notNull()
      .references(() => departures.id),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    title: text().notNull(),
    artist: text().notNull(),
    consentAt: timestamp({ withTimezone: true }).notNull(),
    approved: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("circle_tracks_booking_idx").on(t.bookingId), index("circle_tracks_departure_idx").on(t.departureId)],
);

export const reconnectChoices = pgTable(
  "reconnect_choices",
  {
    id: uuid().primaryKey().defaultRandom(),
    departureId: uuid()
      .notNull()
      .references(() => departures.id),
    fromUserId: uuid()
      .notNull()
      .references(() => users.id),
    toUserId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reconnect_choices_pair_idx").on(t.departureId, t.fromUserId, t.toUserId),
    check("reconnect_choices_no_self", sql`${t.fromUserId} <> ${t.toUserId}`),
  ],
);
