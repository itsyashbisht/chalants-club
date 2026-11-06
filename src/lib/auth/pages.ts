import "@/lib/server-guard";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, type CurrentUser } from "./server";
import type { UserRole } from "@/lib/db/core-schema";

/** Only same-origin relative paths are accepted as return targets (no open redirects). */
export function safeReturnPath(value: string | null | undefined, fallback = "/account/bookings"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

export function signInHref(returnTo: string): string {
  return `/sign-in?redirect_url=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

/** For pages: redirects signed-out visitors to sign-in and brings them back afterwards. */
export async function requirePageUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(signInHref(returnTo));
  return user;
}

export async function requirePageRole(returnTo: string, ...roles: UserRole[]): Promise<{ user: CurrentUser; allowed: boolean }> {
  const user = await requirePageUser(returnTo);
  return { user, allowed: hasRole(user, ...roles) };
}
