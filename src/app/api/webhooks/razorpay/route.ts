import { NextResponse } from "next/server";
import { env, paymentsConfig } from "@/lib/env";
import { isAppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { tryGetPaymentProvider } from "@/lib/razorpay/client";
import { ingestWebhook, processInboxItem, MAX_WEBHOOK_BYTES } from "@/features/payments/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Provider webhook. Excluded from Clerk and CSRF checks; authenticated only by the signature over the raw bytes.
 * The event is stored durably before 2xx. Processing is attempted inline and otherwise picked up by the worker.
 */
export async function POST(req: Request) {
  const e = env();
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_WEBHOOK_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const rawBody = Buffer.from(await req.arrayBuffer());
  const cfg = paymentsConfig();
  const mode = cfg.ok ? cfg.mode : e.RAZORPAY_MODE;
  try {
    const { inboxId, duplicate } = await ingestWebhook({
      rawBody,
      signature: req.headers.get("x-razorpay-signature"),
      eventId: req.headers.get("x-razorpay-event-id"),
      mode,
      secrets: [e.RAZORPAY_WEBHOOK_SECRET, e.RAZORPAY_WEBHOOK_SECRET_PREVIOUS],
      expectedAccountId: e.RAZORPAY_ACCOUNT_ID,
    });
    if (!duplicate) {
      try {
        await processInboxItem(inboxId, { provider: tryGetPaymentProvider() ?? undefined });
      } catch (error: unknown) {
        log.warn("webhook.inline_processing_failed", { inboxId, error });
      }
    }
    return NextResponse.json({ ok: true, duplicate }, { status: 200 });
  } catch (error: unknown) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    log.error("webhook.persist_failed", { error });
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }
}
