import "@/lib/server-guard";
import type { DbOrTx } from "@/lib/db/client";
import { auditLog } from "@/lib/db/core-schema";

export type AuditEntry = {
  actorType: "user" | "system" | "provider";
  actorUserId?: string | null;
  operation: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

export async function audit(db: DbOrTx, entry: AuditEntry) {
  await db.insert(auditLog).values({
    actorType: entry.actorType,
    actorUserId: entry.actorUserId ?? null,
    operation: entry.operation,
    entityType: entry.entityType,
    entityId: entry.entityId,
    reason: entry.reason ?? null,
    metadata: entry.metadata ?? {},
  });
}
