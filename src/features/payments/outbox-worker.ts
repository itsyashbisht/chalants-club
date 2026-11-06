import "@/lib/server-guard";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { Clock } from "@/lib/clock";
import { getDb, type Db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { log } from "@/lib/logger";
import type { PaymentProvider } from "@/lib/razorpay/provider";
import { tryGetPaymentProvider } from "@/lib/razorpay/client";
import { buildBookingEmail } from "@/features/bookings/notifications";
import { buildSupportEmail } from "@/features/support/service";
import { buildWaitlistEmail } from "@/features/trips/service";
import { outbox } from "./schema";
import { backoffMinutes } from "./outbox";
import { submitRefund } from "./refund-worker";

type Deps = { clock?: Clock; db?: Db; provider?: PaymentProvider };

const MAX_ATTEMPTS = 10;

/** Delivers pending outbox items: customer emails, staff alerts and refund submissions. */
export async function processOutboxBatch(limit = 50, deps: Deps = {}): Promise<{ delivered: number; retried: number; failed: number }> {
  const db = deps.db ?? getDb();
  const now = deps.clock ? deps.clock.now() : new Date();
  const claimed = await db
    .update(outbox)
    .set({ status: "processing", attempts: sql`${outbox.attempts} + 1` })
    .where(
      and(
        eq(outbox.status, "pending"),
        or(isNull(outbox.nextRetryAt), lte(outbox.nextRetryAt, now)),
        sql`${outbox.id} in (select id from outbox where status = 'pending' and (next_retry_at is null or next_retry_at <= ${now}) order by created_at asc limit ${limit} for update skip locked)`,
      ),
    )
    .returning();
  const summary = { delivered: 0, retried: 0, failed: 0 };
  for (const item of claimed) {
    try {
      await deliver(item, deps);
      await db.update(outbox).set({ status: "delivered", deliveredAt: deps.clock ? deps.clock.now() : new Date(), lastError: null }).where(eq(outbox.id, item.id));
      summary.delivered += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (item.attempts >= MAX_ATTEMPTS) {
        await db.update(outbox).set({ status: "failed", lastError: message }).where(eq(outbox.id, item.id));
        log.error("outbox.failed", { outboxId: item.id, kind: item.kind, message });
        summary.failed += 1;
      } else {
        const retryAt = new Date((deps.clock ? deps.clock.now() : new Date()).getTime() + backoffMinutes(item.attempts) * 60_000);
        await db.update(outbox).set({ status: "pending", lastError: message, nextRetryAt: retryAt }).where(eq(outbox.id, item.id));
        log.warn("outbox.retry", { outboxId: item.id, kind: item.kind, attempts: item.attempts, message });
        summary.retried += 1;
      }
    }
  }
  return summary;
}

async function deliver(item: typeof outbox.$inferSelect, deps: Deps) {
  const db = deps.db ?? getDb();
  if (item.kind.startsWith("email.")) {
    const message =
      item.kind === "email.support_case"
        ? await buildSupportEmail(item.payload, db)
        : item.kind === "email.waitlist"
          ? await buildWaitlistEmail(item.payload, db)
          : await buildBookingEmail(item.kind, item.payload, db);
    if (!message) throw new Error(`No email could be built for ${item.kind}`);
    await sendEmail(message, db);
    return;
  }
  if (item.kind.startsWith("alert.")) {
    const staff = env().STAFF_ALERT_EMAIL;
    const subject = `[${env().APP_ENV}] ${item.kind}`;
    const text = `${item.kind}\n\n${JSON.stringify(item.payload, null, 2)}\n\nOpen the admin payments page to resolve.`;
    if (staff) {
      await sendEmail({ to: staff, subject, text, idempotencyKey: `alert:${item.transitionKey}` }, db);
    } else {
      log.warn("alert.unrouted", { kind: item.kind, transitionKey: item.transitionKey });
    }
    return;
  }
  if (item.kind === "refund.submit") {
    const refundId = String(item.payload.refundId);
    const provider = deps.provider ?? tryGetPaymentProvider();
    if (!provider) throw new Error("Payments provider not configured; refund submission deferred.");
    const result = await submitRefund(refundId, { ...deps, provider, db });
    if (result && result.state === "processing" && !result.providerRefundId) {
      // The submission is pending at the provider; a retry item was queued with a backoff.
      return;
    }
    return;
  }
  throw new Error(`Unknown outbox kind ${item.kind}`);
}
