import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["host", "reviewer", "finance", "operator"]);
export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    clerkUserId: text().notNull(),
    email: text().notNull(),
    name: text(),
    mfaEnabled: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex("users_clerk_user_id_idx").on(t.clerkUserId), index("users_email_idx").on(t.email)],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRoleEnum().notNull(),
    grantedBy: uuid().references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const auditActorEnum = pgEnum("audit_actor", ["user", "system", "provider"]);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    actorType: auditActorEnum().notNull(),
    actorUserId: uuid().references(() => users.id),
    operation: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    reason: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId, t.createdAt)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text().primaryKey(),
  windowStart: timestamp({ withTimezone: true }).notNull(),
  count: integer().notNull().default(0),
});

export const jobLeases = pgTable("job_leases", {
  name: text().primaryKey(),
  leaseId: text().notNull(),
  leasedUntil: timestamp({ withTimezone: true }).notNull(),
  lastRunAt: timestamp({ withTimezone: true }),
  lastResult: jsonb().$type<Record<string, unknown>>(),
});

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: text().notNull(),
    operation: text().notNull(),
    key: text().notNull(),
    requestHash: text().notNull(),
    responseStatus: integer(),
    responseBody: jsonb().$type<unknown>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("idempotency_keys_scope_idx").on(t.actorId, t.operation, t.key)],
);

export const emailStatusEnum = pgEnum("email_status", ["queued", "sent", "failed", "recorded"]);

export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: uuid().primaryKey().defaultRandom(),
    idempotencyKey: text().notNull(),
    recipient: text().notNull(),
    subject: text().notNull(),
    body: text().notNull(),
    status: emailStatusEnum().notNull(),
    providerMessageId: text(),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_deliveries_key_idx").on(t.idempotencyKey), index("email_deliveries_recipient_idx").on(t.recipient)],
);

export const activeBookingStatesSql = sql`('HELD','UNDER_REVIEW','BALANCE_DUE','CONFIRMED')`;
