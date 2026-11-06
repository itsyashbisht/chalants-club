import { createHmac, timingSafeEqual } from "node:crypto";

const HEX = /^[0-9a-f]+$/i;

function hmacHex(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time comparison of two hex digests of equal length. */
export function safeEqualHex(expected: string, provided: string): boolean {
  if (!HEX.test(provided) || !HEX.test(expected)) return false;
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
}

/** Checkout response signature: HMAC-SHA256(key secret, `${orderId}|${paymentId}`). */
export function verifyCheckoutSignature(opts: { keySecret: string; orderId: string; paymentId: string; signature: string }): boolean {
  const expected = hmacHex(opts.keySecret, `${opts.orderId}|${opts.paymentId}`);
  return safeEqualHex(expected, opts.signature);
}

export function signCheckout(keySecret: string, orderId: string, paymentId: string): string {
  return hmacHex(keySecret, `${orderId}|${paymentId}`);
}

/** Webhook signature over the raw request bytes. Accepts the current secret and, during rotation, the previous one. */
export function verifyWebhookSignature(opts: { rawBody: Buffer; signature: string | null; secrets: Array<string | undefined> }): boolean {
  if (!opts.signature) return false;
  for (const secret of opts.secrets) {
    if (!secret) continue;
    if (safeEqualHex(hmacHex(secret, opts.rawBody), opts.signature)) return true;
  }
  return false;
}

export function signWebhook(secret: string, rawBody: Buffer | string): string {
  return hmacHex(secret, rawBody);
}
