import "@/lib/server-guard";
import { eq } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/lib/db/client";
import { emailDeliveries } from "@/lib/db/core-schema";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  /** Stable per business transition so retries never send twice. */
  idempotencyKey: string;
};

export interface EmailAdapter {
  send(message: EmailMessage): Promise<{ providerMessageId: string | null }>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class ResendAdapter implements EmailAdapter {
  constructor(private readonly apiKey: string) {}
  async send(message: EmailMessage) {
    const { Resend } = await import("resend");
    const resend = new Resend(this.apiKey);
    const result = await resend.emails.send(
      { from: env().EMAIL_FROM, to: message.to, subject: message.subject, text: message.text },
      { idempotencyKey: message.idempotencyKey },
    );
    if (result.error) throw new Error(`${result.error.name}: ${result.error.message}`);
    return { providerMessageId: result.data?.id ?? null };
  }
}

/** Without a provider key, deliveries are recorded only (visible in admin and tests). */
class RecordOnlyAdapter implements EmailAdapter {
  async send() {
    return { providerMessageId: null };
  }
}

type Globals = typeof globalThis & { __chalantsEmail?: EmailAdapter };
const g = globalThis as Globals;

export function setEmailAdapter(adapter: EmailAdapter | undefined) {
  g.__chalantsEmail = adapter;
}

function adapter(): { adapter: EmailAdapter; recordOnly: boolean } {
  if (g.__chalantsEmail) return { adapter: g.__chalantsEmail, recordOnly: false };
  const key = env().RESEND_API_KEY;
  return key ? { adapter: new ResendAdapter(key), recordOnly: false } : { adapter: new RecordOnlyAdapter(), recordOnly: true };
}

/**
 * Sends an email at most once per idempotency key. Inspects the recipient before sending.
 * Throws on provider failure so the outbox can retry; the delivery row keeps the last error.
 */
export async function sendEmail(message: EmailMessage, db: DbOrTx = getDb()): Promise<void> {
  if (!EMAIL_RE.test(message.to)) {
    log.warn("email.invalid_recipient", { idempotencyKey: message.idempotencyKey });
    throw new Error("Invalid email recipient");
  }
  const [existing] = await db.select().from(emailDeliveries).where(eq(emailDeliveries.idempotencyKey, message.idempotencyKey)).limit(1);
  if (existing && (existing.status === "sent" || existing.status === "recorded")) return;

  const { adapter: impl, recordOnly } = adapter();
  if (!existing) {
    await db
      .insert(emailDeliveries)
      .values({ idempotencyKey: message.idempotencyKey, recipient: message.to, subject: message.subject, body: message.text, status: "queued" })
      .onConflictDoNothing();
  }
  try {
    const result = await impl.send(message);
    await db
      .update(emailDeliveries)
      .set({ status: recordOnly ? "recorded" : "sent", providerMessageId: result.providerMessageId, error: null })
      .where(eq(emailDeliveries.idempotencyKey, message.idempotencyKey));
  } catch (error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    await db.update(emailDeliveries).set({ status: "failed", error: text }).where(eq(emailDeliveries.idempotencyKey, message.idempotencyKey));
    throw error;
  }
}
