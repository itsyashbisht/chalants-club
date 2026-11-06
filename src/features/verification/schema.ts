import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "@/lib/db/core-schema";
import { bookings } from "@/features/bookings/schema";

export const reviewDecisionEnum = pgEnum("review_decision", ["pending", "info_requested", "approved", "rejected"]);
export type ReviewDecision = (typeof reviewDecisionEnum.enumValues)[number];

export const reviewCallStatusEnum = pgEnum("review_call_status", ["none", "requested", "scheduled", "done", "inconclusive"]);
export type ReviewCallStatus = (typeof reviewCallStatusEnum.enumValues)[number];

/** One review per booking. No document numbers or scans are ever stored; only the outcome, time and reviewer. */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid().primaryKey().defaultRandom(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    reviewerId: uuid().references(() => users.id),
    callStatus: reviewCallStatusEnum().notNull().default("none"),
    /** Traveller's private scheduling preference or contact request. Restricted to reviewers. */
    callRequestNote: text(),
    callRequestedAt: timestamp({ withTimezone: true }),
    decision: reviewDecisionEnum().notNull().default("pending"),
    reasonCode: text(),
    note: text(),
    revision: integer().notNull().default(1),
    dueAt: timestamp({ withTimezone: true }).notNull(),
    escalatedAt: timestamp({ withTimezone: true }),
    decidedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reviews_booking_idx").on(t.bookingId), index("reviews_decision_due_idx").on(t.decision, t.dueAt)],
);

export const reviewActions = pgTable(
  "review_actions",
  {
    id: uuid().primaryKey().defaultRandom(),
    reviewId: uuid()
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    actorUserId: uuid().references(() => users.id),
    action: text().notNull(),
    reasonCode: text(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_actions_review_idx").on(t.reviewId, t.createdAt)],
);
