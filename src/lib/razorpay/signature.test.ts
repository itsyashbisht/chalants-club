import { describe, expect, it } from "vitest";
import { safeEqualHex, signCheckout, signWebhook, verifyCheckoutSignature, verifyWebhookSignature } from "./signature";

describe("checkout signature", () => {
  const keySecret = "secret_abc";
  it("accepts the documented HMAC over orderId|paymentId", () => {
    const signature = signCheckout(keySecret, "order_1", "pay_1");
    expect(verifyCheckoutSignature({ keySecret, orderId: "order_1", paymentId: "pay_1", signature })).toBe(true);
    expect(verifyCheckoutSignature({ keySecret, orderId: "order_1", paymentId: "pay_1", signature: signature.toUpperCase() })).toBe(true);
  });
  it("rejects a signature for a different order or key", () => {
    const signature = signCheckout(keySecret, "order_1", "pay_1");
    expect(verifyCheckoutSignature({ keySecret, orderId: "order_2", paymentId: "pay_1", signature })).toBe(false);
    expect(verifyCheckoutSignature({ keySecret: "other", orderId: "order_1", paymentId: "pay_1", signature })).toBe(false);
  });
  it("rejects malformed or wrong-length digests without throwing", () => {
    expect(verifyCheckoutSignature({ keySecret, orderId: "o", paymentId: "p", signature: "zz" })).toBe(false);
    expect(verifyCheckoutSignature({ keySecret, orderId: "o", paymentId: "p", signature: "abcd" })).toBe(false);
    expect(safeEqualHex("ab", "abcd")).toBe(false);
  });
});

describe("webhook signature", () => {
  const body = Buffer.from(JSON.stringify({ event: "payment.captured", payload: {} }));
  it("verifies over the raw bytes and rejects altered bytes", () => {
    const signature = signWebhook("whsec", body);
    expect(verifyWebhookSignature({ rawBody: body, signature, secrets: ["whsec"] })).toBe(true);
    const altered = Buffer.from(body.toString("utf8").replace("captured", "failed"));
    expect(verifyWebhookSignature({ rawBody: altered, signature, secrets: ["whsec"] })).toBe(false);
  });
  it("accepts the previous secret during rotation and nothing else", () => {
    const signature = signWebhook("old", body);
    expect(verifyWebhookSignature({ rawBody: body, signature, secrets: ["new", "old"] })).toBe(true);
    expect(verifyWebhookSignature({ rawBody: body, signature, secrets: ["new", undefined] })).toBe(false);
    expect(verifyWebhookSignature({ rawBody: body, signature: null, secrets: ["old"] })).toBe(false);
  });
});
