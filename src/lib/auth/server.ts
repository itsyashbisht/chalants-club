import "@/lib/server-guard";
import { cookies } from "next/headers";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users, userRoles, auditLog, type UserRole } from "@/lib/db/core-schema";
import { env, isClerkConfigured, isDevAuthBypassEnabled } from "@/lib/env";
import { errors } from "@/lib/errors";
import { log } from "@/lib/logger";

export type SessionIdentity = { subject: string; email: string; name: string | null; mfaEnabled: boolean };

export type CurrentUser = {
  id: string;
  clerkUserId: string;
  email: string;
  name: string | null;
  roles: UserRole[];
  mfaEnabled: boolean;
};

export const STAFF_ROLES: UserRole[] = ["host", "reviewer", "finance", "operator"];

/** Resolves the signed-in identity from Clerk, or from the local dev bypass cookie when enabled. */
export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  if (isClerkConfigured()) {
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    const session = await auth();
    if (!session.userId) return null;
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? `${session.userId}@clerk.local`;
    const name = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || null : null;
    const mfaEnabled = Boolean(user?.twoFactorEnabled);
    return { subject: session.userId, email, name, mfaEnabled };
  }
  if (isDevAuthBypassEnabled()) {
    const jar = await cookies();
    const email = jar.get("dev_user_email")?.value?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) return null;
    return { subject: `dev:${email}`, email, name: jar.get("dev_user_name")?.value ?? null, mfaEnabled: true };
  }
  return null;
}

/** Loads or creates the local user row for the signed-in identity. Null when signed out. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const identity = await getSessionIdentity();
  if (!identity) return null;
  return upsertUser(identity);
}

export async function upsertUser(identity: SessionIdentity): Promise<CurrentUser> {
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.clerkUserId, identity.subject)).limit(1);
  let userId: string;
  if (existing) {
    userId = existing.id;
    if (existing.email !== identity.email || existing.name !== identity.name || existing.mfaEnabled !== identity.mfaEnabled) {
      await db
        .update(users)
        .set({ email: identity.email, name: identity.name, mfaEnabled: identity.mfaEnabled, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }
  } else {
    const [created] = await db
      .insert(users)
      .values({ clerkUserId: identity.subject, email: identity.email, name: identity.name, mfaEnabled: identity.mfaEnabled })
      .onConflictDoUpdate({ target: users.clerkUserId, set: { email: identity.email, updatedAt: new Date() } })
      .returning();
    userId = created.id;
    await bootstrapOperator(userId, identity.email);
  }
  const roles = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return {
    id: userId,
    clerkUserId: identity.subject,
    email: identity.email,
    name: identity.name,
    roles: roles.map((r) => r.role),
    mfaEnabled: identity.mfaEnabled,
  };
}

/** Pilot bootstrap: emails listed in BOOTSTRAP_OPERATOR_EMAILS become operators on first sign-in (audited). */
async function bootstrapOperator(userId: string, email: string) {
  const list = env()
    .BOOTSTRAP_OPERATOR_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!list.includes(email.toLowerCase())) return;
  const db = getDb();
  await db.insert(userRoles).values({ userId, role: "operator" }).onConflictDoNothing();
  await db.insert(auditLog).values({
    actorType: "system",
    operation: "role.grant",
    entityType: "user",
    entityId: userId,
    reason: "BOOTSTRAP_OPERATOR_EMAILS",
    metadata: { role: "operator" },
  });
  log.info("auth.bootstrap_operator", { userId });
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthenticated();
  return user;
}

export function hasRole(user: CurrentUser, ...roles: UserRole[]): boolean {
  return roles.some((r) => user.roles.includes(r));
}

export function isStaff(user: CurrentUser): boolean {
  return hasRole(user, ...STAFF_ROLES);
}

/** Staff actions require an authenticated user holding one of the roles and MFA when Clerk is configured. */
export async function requireRole(...roles: UserRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user, ...roles)) throw errors.forbidden();
  if (isClerkConfigured() && env().APP_ENV === "production" && !user.mfaEnabled) {
    throw errors.forbidden("Staff actions require multi-factor authentication on your account.");
  }
  return user;
}

export async function grantRole(opts: { userId: string; role: UserRole; grantedBy: string; reason: string }) {
  const db = getDb();
  await db.insert(userRoles).values({ userId: opts.userId, role: opts.role, grantedBy: opts.grantedBy }).onConflictDoNothing();
  await db.insert(auditLog).values({
    actorType: "user",
    actorUserId: opts.grantedBy,
    operation: "role.grant",
    entityType: "user",
    entityId: opts.userId,
    reason: opts.reason,
    metadata: { role: opts.role },
  });
}

export async function revokeRole(opts: { userId: string; role: UserRole; revokedBy: string; reason: string }) {
  const db = getDb();
  await db.delete(userRoles).where(and(eq(userRoles.userId, opts.userId), eq(userRoles.role, opts.role)));
  await db.insert(auditLog).values({
    actorType: "user",
    actorUserId: opts.revokedBy,
    operation: "role.revoke",
    entityType: "user",
    entityId: opts.userId,
    reason: opts.reason,
    metadata: { role: opts.role },
  });
}
