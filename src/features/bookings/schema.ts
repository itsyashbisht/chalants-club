import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "@/lib/db/core-schema";
import { departures, policyVersions, type PolicyRules } from "@/features/trips/schema";

export const bookingStateEnum = pgEnum("booking_state", [
  "HELD",
  "UNDER_REVIEW",
  "BALANCE_DUE",
  "CONFIRMED",
  "EXPIRED",
  "REJECTED",
  "CANCELLED",
  "COMPLETED",
]);
export type BookingState = (typeof bookingStateEnum.enumValues)[number];

export const ACTIVE_BOOKING_STATES: BookingState[] = ["HELD", "UNDER_REVIEW", "BALANCE_DUE", "CONFIRMED"];

/** Quiz answers stored with a booking. Q8 (private intent) is omitted by construction. */
export type QuizSnapshot = {
  version: string;
  answers: Record<string, string | number>;
  track?: { title: string; artist: string } | null;
};

export const bookings = pgTable(
  "bookings",
  {
    id: uuid().primaryKey().defaultRandom(),
    reference: text().notNull(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id),
    departureId: uuid()
      .notNull()
      .references(() => departures.id),
    state: bookingStateEnum().notNull(),
    holdExpiresAt: timestamp({ withTimezone: true }),
    reviewDueAt: timestamp({ withTimezone: true }),
    balanceDueAt: timestamp({ withTimezone: true }),
    approvedAt: timestamp({ withTimezone: true }),
    confirmedAt: timestamp({ withTimezone: true }),
    closedAt: timestamp({ withTimezone: true }),
    /** Immutable quote snapshot. */
    totalPaise: integer().notNull(),
    depositPaise: integer().notNull(),
    balancePaise: integer().notNull(),
    quoteVersion: integer().notNull(),
    taxesNote: text().notNull(),
    policyVersionId: uuid()
      .notNull()
      .references(() => policyVersions.id),
    policyRules: jsonb().$type<PolicyRules>().notNull(),
    quizSnapshot: jsonb().$type<QuizSnapshot>(),
    travellerAge: integer().notNull(),
    singleAttestedAt: timestamp({ withTimezone: true }).notNull(),
    conductAcceptedAt: timestamp({ withTimezone: true }).notNull(),
    policyAcceptedAt: timestamp({ withTimezone: true }).notNull(),
    clientOperationKey: text(),
    /** Bumped on every state change; used for optimistic admin decisions. */
    revision: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bookings_reference_idx").on(t.reference),
    uniqueIndex("bookings_active_owner_departure_idx")
      .on(t.ownerId, t.departureId)
      .where(sql`${t.state} in ('HELD','UNDER_REVIEW','BALANCE_DUE','CONFIRMED')`),
    uniqueIndex("bookings_owner_operation_key_idx").on(t.ownerId, t.clientOperationKey),
    index("bookings_departure_state_idx").on(t.departureId, t.state),
    index("bookings_owner_idx").on(t.ownerId, t.createdAt),
    index("bookings_hold_expiry_idx").on(t.state, t.holdExpiresAt),
    index("bookings_balance_due_idx").on(t.state, t.balanceDueAt),
    check("bookings_amounts_positive", sql`${t.totalPaise} > 0 and ${t.depositPaise} > 0 and ${t.balancePaise} > 0`),
    check("bookings_amounts_sum", sql`${t.depositPaise} + ${t.balancePaise} = ${t.totalPaise}`),
    check("bookings_age_adult", sql`${t.travellerAge} >= 18`),
  ],
);

export const cancellationOriginEnum = pgEnum("cancellation_origin", [
  "traveller",
  "operator",
  "rejection",
  "balance_timeout",
  "departure_cancelled",
]);
export type CancellationOrigin = (typeof cancellationOriginEnum.enumValues)[number];

export type RefundBreakdown = {
  capturedPaise: number;
  refundBps: number;
  refundPaise: number;
  rule: string;
  perPayment: Array<{ paymentAttemptId: string; instalment: "deposit" | "balance"; capturedPaise: number; refundPaise: number }>;
};

export const cancelQuotes = pgTable(
  "cancel_quotes",
  {
    id: uuid().primaryKey().defaultRandom(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    bookingRevision: integer().notNull(),
    refundPaise: integer().notNull(),
    breakdown: jsonb().$type<RefundBreakdown>().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cancel_quotes_booking_idx").on(t.bookingId)],
);

export const cancellations = pgTable(
  "cancellations",
  {
    id: uuid().primaryKey().defaultRandom(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    origin: cancellationOriginEnum().notNull(),
    quoteId: uuid().references(() => cancelQuotes.id),
    capturedPaise: integer().notNull(),
    refundPaise: integer().notNull(),
    breakdown: jsonb().$type<RefundBreakdown>().notNull(),
    actorUserId: uuid().references(() => users.id),
    reason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("cancellations_booking_idx").on(t.bookingId)],
);
