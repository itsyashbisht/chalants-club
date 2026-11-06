import "@/lib/server-guard";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Clock } from "@/lib/clock";
import { getDb, type Db } from "@/lib/db/client";
import { withClockTx, retryTx } from "@/lib/db/tx";
import { errors } from "@/lib/errors";
import { sha256Hex } from "@/lib/ids";
import { log } from "@/lib/logger";
import { ProviderError, type PaymentProvider, type ProviderMode } from "@/lib/razorpay/provider";
import { verifyWebhookSignature } from "@/lib/razorpay/signature";
import { paymentAttempts, webhookInbox, type InboxPayload } from "./schema";
import { recordProviderPayment } from "./allocation";
import { syncProviderRefund, providerRefundSchema } from "./refund-worker";
import { enqueue, backoffMinutes } from "./outbox";

export const MAX_WEBHOOK_BYTES = 256 * 1024;
const MAX_INBOX_ATTEMPTS = 8;

const paymentEntity = z.object({
  id: z.string().min(1),
  order_id: z.string().nullable().optional(),
  amount: z.number().int().nonnegative(),
  currency: z.string(),
  status: z.string(),
  method: z.string().nullable().optional(),
  error_code: z.string().nullable().optional(),
  error_description: z.string().nullable().optional(),
});

const orderEntity = z.object({ id: z.string(), amount: z.number().int(), currency: z.string(), status: z.string(), receipt: z.string().nullable().optional() });

export const webhookEventSchema = z.object({
  entity: z.string().optional(),
  account_id: z.string().optional(),
  event: z.string().min(1),
  created_at: z.number().optional(),
  payload: z
    .object({
      payment: z.object({ entity: paymentEntity }).optional(),
      order: z.object({ entity: orderEntity }).optional(),
      refund: z.object({ entity: providerRefundSchema }).optional(),
    })
    .default({}),
});

export const SUBSCRIBED_EVENTS = ["payment.captured", "payment.failed", "payment.authorized", "order.paid", "refund.created", "refund.processed", "refund.failed"] as const;

export type IngestInput = {
  rawBody: Buffer;
  signature: string | null;
  eventId: string | null;
  mode: ProviderMode;
  secrets: Array<string | undefined>;
  expectedAccountId?: string;
};

/**
 * Durable acceptance: verify the signature over the raw bytes, validate the schema, persist the minimum fields
 * uniquely by event ID, then acknowledge. Duplicate deliveries are acknowledged without reprocessing.
 */
export async function ingestWebhook(input: IngestInput, db: Db = getDb()): Promise<{ inboxId: string; duplicate: boolean }> {
  if (input.rawBody.length > MAX_WEBHOOK_BYTES) throw errors.invalid("Payload too large.");
  if (!input.secrets.some(Boolean)) throw errors.unavailable("WEBHOOK_NOT_CONFIGURED", "Webhook secret is not configured.");
  if (!verifyWebhookSignature({ rawBody: input.rawBody, signature: input.signature, secrets: input.secrets })) {
    log.warn("webhook.invalid_signature", { bytes: input.rawBody.length });
    throw errors.unauthenticated("Invalid webhook signature.");
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.rawBody.toString("utf8"));
  } catch {
    throw errors.invalid("Webhook body is not JSON.");
  }
  const parsed = webhookEventSchema.safeParse(parsedJson);
  if (!parsed.success) throw errors.invalid("Webhook event failed validation.");
  const event = parsed.data;
  if (input.expectedAccountId && event.account_id && event.account_id !== input.expectedAccountId) {
    log.warn("webhook.account_mismatch", { accountId: event.account_id });
    throw errors.forbidden("Webhook account mismatch.");
  }
  const eventId = input.eventId?.trim() || `sha256:${sha256Hex(input.rawBody.toString("utf8"))}`;
  const payload: InboxPayload = {
    event: event.event,
    payment: event.payload.payment?.entity
      ? {
          id: event.payload.payment.entity.id,
          order_id: event.payload.payment.entity.order_id ?? null,
          amount: event.payload.payment.entity.amount,
          currency: event.payload.payment.entity.currency,
          status: event.payload.payment.entity.status,
          method: event.payload.payment.entity.method ?? null,
          error_code: event.payload.payment.entity.error_code ?? null,
          error_description: event.payload.payment.entity.error_description ?? null,
        }
      : undefined,
    order: event.payload.order?.entity ? { ...event.payload.order.entity, receipt: event.payload.order.entity.receipt ?? null } : undefined,
    refund: event.payload.refund?.entity
      ? {
          id: event.payload.refund.entity.id,
          payment_id: event.payload.refund.entity.payment_id,
          amount: event.payload.refund.entity.amount,
          currency: event.payload.refund.entity.currency,
          status: event.payload.refund.entity.status,
          notes: Array.isArray(event.payload.refund.entity.notes) ? {} : (event.payload.refund.entity.notes ?? {}),
          receipt: event.payload.refund.entity.receipt ?? null,
        }
      : undefined,
  };
  const [inserted] = await db
    .insert(webhookInbox)
    .values({
      provider: "razorpay",
      mode: input.mode,
      eventId,
      eventType: event.event,
      providerPaymentId: payload.payment?.id ?? payload.refund?.payment_id ?? null,
      providerOrderId: payload.payment?.order_id ?? payload.order?.id ?? null,
      providerRefundId: payload.refund?.id ?? null,
      payload,
    })
    .onConflictDoNothing()
    .returning({ id: webhookInbox.id });
  if (inserted) return { inboxId: inserted.id, duplicate: false };
  const [existing] = await db
    .select({ id: webhookInbox.id })
    .from(webhookInbox)
    .where(and(eq(webhookInbox.provider, "razorpay"), eq(webhookInbox.mode, input.mode), eq(webhookInbox.eventId, eventId)))
    .limit(1);
  return { inboxId: existing.id, duplicate: true };
}

type Deps = { clock?: Clock; db?: Db; provider?: PaymentProvider };

/** Processes one stored event transactionally. Safe to call repeatedly. */
export async function processInboxItem(inboxId: string, deps: Deps = {}): Promise<"processed" | "skipped" | "retry" | "failed"> {
  const db = deps.db ?? getDb();
  const [item] = await db.select().from(webhookInbox).where(eq(webhookInbox.id, inboxId)).limit(1);
  if (!item || item.status === "processed" || item.status === "quarantined") return "skipped";
  try {
    await retryTx(() =>
      withClockTx(async (tx, now) => {
        const payload = item.payload;
        if (payload.payment && (item.eventType.startsWith("payment.") || item.eventType === "order.paid")) {
          let entity = payload.payment;
          // A delayed "failed" after a capture, or a capture after a local failure, is resolved from the provider.
          const [local] = await tx
            .select({ status: paymentAttempts.status })
            .from(paymentAttempts)
            .where(and(eq(paymentAttempts.providerPaymentId, entity.id), eq(paymentAttempts.mode, item.mode)))
            .limit(1);
          const conflicting = local && ((local.status === "failed" && entity.status === "captured") || (local.status === "captured" && entity.status === "failed"));
          if (conflicting && deps.provider) {
            try {
              const fresh = await deps.provider.fetchPayment(entity.id);
              entity = { ...entity, status: fresh.status, amount: fresh.amount, currency: fresh.currency, order_id: fresh.order_id };
            } catch (error: unknown) {
              if (!(error instanceof ProviderError && error.kind === "not_found")) throw error;
            }
          }
          await recordProviderPayment(tx, { mode: item.mode, payment: entity, source: "webhook", now });
        } else if (payload.refund && item.eventType.startsWith("refund.")) {
          const parsed = providerRefundSchema.parse(payload.refund);
          await syncProviderRefund(tx, { mode: item.mode, refund: parsed, now });
        }
        await tx.update(webhookInbox).set({ status: "processed", processedAt: now, lastError: null }).where(eq(webhookInbox.id, item.id));
      }, deps),
    );
    return "processed";
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = item.attempts + 1;
    const now = deps.clock ? deps.clock.now() : new Date();
    if (attempts >= MAX_INBOX_ATTEMPTS) {
      await db.update(webhookInbox).set({ status: "failed", attempts, lastError: message }).where(eq(webhookInbox.id, item.id));
      await enqueue(db, "alert.ops", `alert.inbox_failed:${item.id}`, { inboxId: item.id, eventType: item.eventType, message });
      log.error("webhook.process_failed", { inboxId: item.id, message });
      return "failed";
    }
    await db
      .update(webhookInbox)
      .set({ attempts, lastError: message, nextRetryAt: new Date(now.getTime() + backoffMinutes(attempts) * 60_000) })
      .where(eq(webhookInbox.id, item.id));
    log.warn("webhook.process_retry", { inboxId: item.id, attempts, message });
    return "retry";
  }
}

/** Worker: processes received events in arrival order, bounded per tick. */
export async function processInboxBatch(limit = 50, deps: Deps = {}): Promise<{ processed: number; retried: number; failed: number }> {
  const db = deps.db ?? getDb();
  const now = deps.clock ? deps.clock.now() : new Date();
  const due = await db
    .select({ id: webhookInbox.id })
    .from(webhookInbox)
    .where(and(eq(webhookInbox.status, "received"), or(isNull(webhookInbox.nextRetryAt), lte(webhookInbox.nextRetryAt, now))))
    .orderBy(sql`${webhookInbox.receivedAt} asc`)
    .limit(limit);
  const summary = { processed: 0, retried: 0, failed: 0 };
  for (const { id } of due) {
    const result = await processInboxItem(id, deps);
    if (result === "processed") summary.processed += 1;
    else if (result === "retry") summary.retried += 1;
    else if (result === "failed") summary.failed += 1;
  }
  return summary;
}
