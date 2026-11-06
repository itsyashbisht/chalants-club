import "@/lib/server-guard";
import { log } from "@/lib/logger";

/**
 * Runs a read query for a public page and returns a fallback when the database is not configured or unreachable,
 * so marketing pages still render on a bare deployment. Private and booking pages never use this.
 */
export async function withDbFallback<T>(fallback: T, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error: unknown) {
    log.warn("public.db_unavailable", { error });
    return fallback;
  }
}
