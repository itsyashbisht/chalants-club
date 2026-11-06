import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "@/lib/db/core-schema";

/** Saved answers for a signed-in traveller. Private intent (Q8) is never stored here. */
export const quizSubmissions = pgTable(
  "quiz_submissions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: text().notNull(),
    answers: jsonb().$type<Record<string, string | number>>().notNull(),
    trackTitle: text(),
    trackArtist: text(),
    trackConsentAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    completed: boolean().notNull().default(true),
  },
  (t) => [index("quiz_submissions_user_idx").on(t.userId, t.createdAt)],
);
