import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { bookings, cancellations } from "@/features/bookings/schema";

export const instalmentKindEnum = pgEnum("instalment_kind", ["deposit", "balance"]);
export type InstalmentKind = (typeof instalmentKindEnum.enumValues)[number];

export const instalmentStatusEnum = pgEnum("instalment_status", ["pending", "paid", "void"]);
export const providerModeEnum = pgEnum("provider_mode", ["test", "live"]);
export const orderRequestStateEnum = pgEnum("order_request_state", ["leased", "created", "uncertain", "superseded", "paid", "void"]);
export const paymentStatusEnum = pgEnum("payment_status", ["created", "authorized", "captured", "failed", "refunded"]);
export const allocationOutcomeEnum = pgEnum("allocation_outcome", ["applied", "unapplied_late", "unapplied_duplicate", "unapplied_mismatch"]);
export const refundStateEnum = pgEnum("refund_state", ["requested", "processing", "processed", "failed"]);
export const inboxStatusEnum = pgEnum("inbox_status", ["received", "processed", "quarantined", "failed"]);
export const outboxStatusEnum = pgEnum("outbox_status", ["pending", "processing", "delivered", "failed"]);

/** Two per booking: deposit and balance. Amounts are immutable once created. */
export const instalments = pgTable(
  "instalments",
  {
    id: uuid().primaryKey().defaultRandom(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    kind: instalmentKindEnum().notNull(),
    amountPaise: integer().notNull(),
    status: instalmentStatusEnum().notNull().default("pending"),
    dueAt: timestamp({ withTimezone: true }),
    paidAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("instalments_booking_kind_idx").on(t.bookingId, t.kind), check("instalments_amount_positive", sql`${t.amountPaise} > 0`)],
);

export const gatewayOrders = pgTable(
  "gateway_orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    instalmentId: uuid()
      .notNull()
      .references(() => instalments.id),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    mode: providerModeEnum().notNull(),
    receipt: text().notNull(),
    operationKey: text().notNull(),
    providerOrderId: text(),
    requestState: orderRequestStateEnum().notNull().default("leased"),
    leaseExpiresAt: timestamp({ withTimezone: true }),
    amountPaise: integer().notNull(),
    currency: text().notNull().default("INR"),
    attempt: integer().notNull().default(1),
    lastError: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gateway_orders_receipt_idx").on(t.receipt),
    uniqueIndex("gateway_orders_operation_key_idx").on(t.operationKey),
    uniqueIndex("gateway_orders_provider_order_idx").on(t.providerOrderId, t.mode),
    index("gateway_orders_instalment_idx").on(t.instalmentId, t.requestState),
    index("gateway_orders_booking_idx").on(t.bookingId),
  ],
);

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    mode: providerModeEnum().notNull(),
    providerPaymentId: text().notNull(),
    providerOrderId: text(),
    gatewayOrderId: uuid().references(() => gatewayOrders.id),
    bookingId: uuid().references(() => bookings.id),
    amountPaise: integer().notNull(),
    currency: text().notNull(),
    status: paymentStatusEnum().notNull(),
    method: text(),
    source: text().notNull(),
    capturedAt: timestamp({ withTimezone: true }),
    failedAt: timestamp({ withTimezone: true }),
    errorCode: text(),
    errorDescription: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_attempts_provider_payment_idx").on(t.providerPaymentId, t.mode),
    index("payment_attempts_booking_idx").on(t.bookingId),
    index("payment_attempts_order_idx").on(t.providerOrderId),
  ],
);

/** Links a captured payment to the instalment it fulfilled, or records why it could not be applied. */
export const allocations = pgTable(
  "allocations",
  {
    id: uuid().primaryKey().defaultRandom(),
    paymentAttemptId: uuid()
      .notNull()
      .references(() => paymentAttempts.id),
    instalmentId: uuid().references(() => instalments.id),
    bookingId: uuid().references(() => bookings.id),
    outcome: allocationOutcomeEnum().notNull(),
    amountPaise: integer().notNull(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("allocations_payment_idx").on(t.paymentAttemptId),
    uniqueIndex("allocations_applied_instalment_idx").on(t.instalmentId).where(sql`${t.outcome} = 'applied'`),
    index("allocations_booking_idx").on(t.bookingId),
  ],
);

export type RefundRequestBody = { amount: number; receipt: string; notes: Record<string, string> };

export const refunds = pgTable(
  "refunds",
  {
    /** Operation UUID; also the provider idempotency key. */
    id: uuid().primaryKey().defaultRandom(),
    paymentAttemptId: uuid()
      .notNull()
      .references(() => paymentAttempts.id),
    bookingId: uuid().references(() => bookings.id),
    cancellationId: uuid().references(() => cancellations.id),
    mode: providerModeEnum().notNull(),
    amountPaise: integer().notNull(),
    reason: text().notNull(),
    origin: text().notNull().default("app"),
    requestBody: jsonb().$type<RefundRequestBody>(),
    requestFingerprint: text(),
    idempotencyKey: text().notNull(),
    receipt: text(),
    providerRefundId: text(),
    state: refundStateEnum().notNull().default("requested"),
    attempts: integer().notNull().default(0),
    nextRetryAt: timestamp({ withTimezone: true }),
    lastError: text(),
    processedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("refunds_idempotency_idx").on(t.idempotencyKey),
    uniqueIndex("refunds_provider_refund_idx").on(t.providerRefundId, t.mode),
    index("refunds_payment_idx").on(t.paymentAttemptId),
    index("refunds_booking_idx").on(t.bookingId),
    index("refunds_state_retry_idx").on(t.state, t.nextRetryAt),
    check("refunds_amount_positive", sql`${t.amountPaise} > 0`),
  ],
);

export type InboxPayload = {
  event: string;
  payment?: { id: string; order_id: string | null; amount: number; currency: string; status: string; method?: string | null; error_code?: string | null; error_description?: string | null };
  order?: { id: string; amount: number; currency: string; status: string; receipt?: string | null };
  refund?: { id: string; payment_id: string; amount: number; currency: string; status: string; notes?: Record<string, string>; receipt?: string | null };
};

export const webhookInbox = pgTable(
  "webhook_inbox",
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull().default("razorpay"),
    mode: providerModeEnum().notNull(),
    eventId: text().notNull(),
    eventType: text().notNull(),
    providerPaymentId: text(),
    providerOrderId: text(),
    providerRefundId: text(),
    payload: jsonb().$type<InboxPayload>().notNull(),
    status: inboxStatusEnum().notNull().default("received"),
    attempts: integer().notNull().default(0),
    nextRetryAt: timestamp({ withTimezone: true }),
    lastError: text(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("webhook_inbox_event_idx").on(t.provider, t.mode, t.eventId),
    index("webhook_inbox_status_idx").on(t.status, t.nextRetryAt),
    index("webhook_inbox_payment_idx").on(t.providerPaymentId),
  ],
);

export type OutboxKind =
  | "email.deposit_receipt"
  | "email.approved"
  | "email.rejected"
  | "email.info_requested"
  | "email.confirmed"
  | "email.hold_expired"
  | "email.balance_expired"
  | "email.cancelled"
  | "email.refund_update"
  | "email.support_case"
  | "email.waitlist"
  | "alert.review_overdue"
  | "alert.finance"
  | "alert.ops"
  | "refund.submit";

export const outbox = pgTable(
  "outbox",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: text().$type<OutboxKind>().notNull(),
    transitionKey: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    status: outboxStatusEnum().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    nextRetryAt: timestamp({ withTimezone: true }),
    lastError: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex("outbox_transition_key_idx").on(t.transitionKey), index("outbox_status_idx").on(t.status, t.nextRetryAt)],
);
