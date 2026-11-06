import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "@/lib/db/core-schema";
import { bookings } from "@/features/bookings/schema";

export const supportStatusEnum = pgEnum("support_status", ["open", "in_progress", "closed"]);

export const supportCases = pgTable(
  "support_cases",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid().references(() => users.id),
    bookingId: uuid().references(() => bookings.id),
    email: text().notNull(),
    name: text(),
    category: text().notNull(),
    subject: text().notNull(),
    message: text().notNull(),
    status: supportStatusEnum().notNull().default("open"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("support_cases_owner_idx").on(t.ownerId), index("support_cases_status_idx").on(t.status, t.createdAt)],
);
