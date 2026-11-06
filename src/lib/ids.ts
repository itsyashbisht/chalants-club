import { randomUUID, randomBytes, createHash } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

// Crockford-style alphabet without ambiguous characters.
const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/** Human-friendly booking reference such as TC-7KQ2MX. */
export function newBookingReference(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i += 1) out += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
  return `TC-${out}`;
}

/** Short token for provider receipts (lowercase alphanumeric). */
export function shortToken(length = 10): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Stable JSON stringify for request fingerprints (sorted keys). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
  }
  return value;
}
