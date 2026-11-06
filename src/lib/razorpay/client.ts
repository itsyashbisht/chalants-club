import "@/lib/server-guard";
import { paymentsConfig } from "@/lib/env";
import { errors } from "@/lib/errors";
import { log } from "@/lib/logger";
import {
  ProviderError,
  type CreateOrderInput,
  type CreateRefundInput,
  type PaymentProvider,
  type ProviderMode,
  type ProviderOrder,
  type ProviderPayment,
  type ProviderRefund,
} from "./provider";

const BASE_URL = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 12_000;

type Json = Record<string, unknown>;

/**
 * Minimal authenticated HTTP client for the Razorpay REST API.
 * Uses fetch directly so that per-request headers (refund idempotency) can be set,
 * which the official SDK does not expose per call.
 */
export class RazorpayClient implements PaymentProvider {
  readonly mode: ProviderMode;
  readonly keyId: string;
  private readonly authHeader: string;

  constructor(opts: { keyId: string; keySecret: string; mode: ProviderMode }) {
    this.mode = opts.mode;
    this.keyId = opts.keyId;
    this.authHeader = `Basic ${Buffer.from(`${opts.keyId}:${opts.keySecret}`).toString("base64")}`;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: Json, extraHeaders?: Record<string, string>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(extraHeaders ?? {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error: unknown) {
      clearTimeout(timer);
      const aborted = error instanceof Error && error.name === "AbortError";
      log.warn("razorpay.request_failed", { method, path, aborted });
      throw new ProviderError(aborted ? "timeout" : "network", aborted ? "Provider request timed out" : "Provider unreachable");
    }
    clearTimeout(timer);

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (res.ok) return data as T;

    const err = (data as { error?: { code?: string; description?: string } } | null)?.error;
    const description = err?.description ?? `Provider responded with ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new ProviderError("auth", description, res.status, err?.code);
    if (res.status === 404) throw new ProviderError("not_found", description, res.status, err?.code);
    if (res.status === 409) throw new ProviderError("conflict", description, res.status, err?.code);
    if (res.status >= 500) throw new ProviderError("server", description, res.status, err?.code);
    throw new ProviderError("bad_request", description, res.status, err?.code);
  }

  createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    return this.request<ProviderOrder>("POST", "/orders", {
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes,
      partial_payment: false,
    });
  }

  fetchOrder(orderId: string): Promise<ProviderOrder> {
    return this.request<ProviderOrder>("GET", `/orders/${encodeURIComponent(orderId)}`);
  }

  async findOrdersByReceipt(receipt: string): Promise<ProviderOrder[]> {
    const data = await this.request<{ items: ProviderOrder[] }>("GET", `/orders?receipt=${encodeURIComponent(receipt)}&count=10`);
    return data.items ?? [];
  }

  async fetchOrderPayments(orderId: string): Promise<ProviderPayment[]> {
    const data = await this.request<{ items: ProviderPayment[] }>("GET", `/orders/${encodeURIComponent(orderId)}/payments`);
    return data.items ?? [];
  }

  fetchPayment(paymentId: string): Promise<ProviderPayment> {
    return this.request<ProviderPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);
  }

  createRefund(paymentId: string, input: CreateRefundInput, idempotencyKey: string): Promise<ProviderRefund> {
    return this.request<ProviderRefund>(
      "POST",
      `/payments/${encodeURIComponent(paymentId)}/refund`,
      { amount: input.amount, speed: "normal", receipt: input.receipt, notes: input.notes },
      { "X-Refund-Idempotency": idempotencyKey },
    );
  }

  fetchRefund(refundId: string): Promise<ProviderRefund> {
    return this.request<ProviderRefund>("GET", `/refunds/${encodeURIComponent(refundId)}`);
  }

  async fetchPaymentRefunds(paymentId: string): Promise<ProviderRefund[]> {
    const data = await this.request<{ items: ProviderRefund[] }>("GET", `/payments/${encodeURIComponent(paymentId)}/refunds?count=100`);
    return data.items ?? [];
  }
}

type Globals = typeof globalThis & { __chalantsProvider?: PaymentProvider };
const g = globalThis as Globals;

/** Test seam: install a fake provider for the process. */
export function setPaymentProvider(provider: PaymentProvider | undefined) {
  g.__chalantsProvider = provider;
}

/** Returns the configured provider or throws a 503 AppError explaining what is missing. */
export function getPaymentProvider(): PaymentProvider {
  if (g.__chalantsProvider) return g.__chalantsProvider;
  const cfg = paymentsConfig();
  if (!cfg.ok) {
    const message =
      cfg.reason === "LIVE_DISABLED"
        ? "Live payments are disabled for this deployment."
        : cfg.reason === "KEY_MODE_MISMATCH"
          ? "Razorpay key does not match RAZORPAY_MODE."
          : "Payments are not configured yet.";
    throw errors.unavailable("PAYMENTS_NOT_CONFIGURED", message);
  }
  g.__chalantsProvider = new RazorpayClient({ keyId: cfg.keyId, keySecret: cfg.keySecret, mode: cfg.mode });
  return g.__chalantsProvider;
}

export function tryGetPaymentProvider(): PaymentProvider | null {
  try {
    return getPaymentProvider();
  } catch {
    return null;
  }
}
