import "@/lib/server-guard";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbOrTx } from "@/lib/db/client";
import { withClockTx } from "@/lib/db/tx";
import { env } from "@/lib/env";
import type { EmailMessage } from "@/lib/email";
import { enqueue } from "@/features/payments/outbox";
import { supportCases } from "./schema";

export const supportInputSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(120).optional(),
  category: z.enum(["booking", "payment", "refund", "safety", "privacy", "deletion", "other"]),
  subject: z.string().trim().min(3).max(150),
  message: z.string().trim().min(10).max(4000),
  bookingId: z.string().uuid().optional(),
});

/** Stores a case and queues delivery to the staffed support inbox. Private reports never go to hosts. */
export async function createSupportCase(input: z.infer<typeof supportInputSchema>, ownerId: string | null) {
  return withClockTx(async (tx, now) => {
    const [row] = await tx
      .insert(supportCases)
      .values({ ...input, ownerId, bookingId: input.bookingId ?? null, name: input.name ?? null, createdAt: now, updatedAt: now })
      .returning();
    await enqueue(tx, "email.support_case", `email.support_case:${row.id}`, { caseId: row.id });
    return row;
  });
}

export async function buildSupportEmail(payload: Record<string, unknown>, db: DbOrTx): Promise<EmailMessage | null> {
  const id = typeof payload.caseId === "string" ? payload.caseId : null;
  if (!id) return null;
  const [row] = await db.select().from(supportCases).where(eq(supportCases.id, id)).limit(1);
  if (!row) return null;
  const e = env();
  return {
    to: e.SUPPORT_EMAIL,
    idempotencyKey: `email.support_case:${id}`,
    subject: `[Support · ${row.category}] ${row.subject}`,
    text: `New support case ${row.id}\nFrom: ${row.name ?? "(no name)"} <${row.email}>\nBooking: ${row.bookingId ?? "none"}\n\n${row.message}\n\nReply directly to the traveller; open the admin booking page for context.`,
  };
}

export async function listSupportCases(db: DbOrTx = getDb()) {
  return db.select().from(supportCases).orderBy(desc(supportCases.createdAt)).limit(200);
}

export async function listSupportCasesForBooking(bookingId: string, db: DbOrTx = getDb()) {
  return db.select().from(supportCases).where(eq(supportCases.bookingId, bookingId)).orderBy(desc(supportCases.createdAt));
}
