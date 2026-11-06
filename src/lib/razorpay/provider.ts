/** Payment provider contract. The real client talks to Razorpay; tests use an in-memory fake. */

export type ProviderMode = "test" | "live";

export type ProviderOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: "created" | "attempted" | "paid";
  notes: Record<string, string>;
};

export type ProviderPaymentStatus = "created" | "authorized" | "captured" | "refunded" | "failed";

export type ProviderPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: ProviderPaymentStatus;
  captured: boolean;
  method: string | null;
  email: string | null;
  error_code: string | null;
  error_description: string | null;
  created_at: number;
};

export type ProviderRefund = {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: "pending" | "processed" | "failed";
  receipt: string | null;
  notes: Record<string, string>;
  created_at: number;
};

export type CreateOrderInput = {
  amount: number;
  currency: "INR";
  receipt: string;
  notes: Record<string, string>;
};

export type CreateRefundInput = {
  amount: number;
  receipt: string;
  notes: Record<string, string>;
};

export type ProviderErrorKind = "timeout" | "network" | "conflict" | "bad_request" | "auth" | "not_found" | "server";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  readonly providerCode?: string;

  constructor(kind: ProviderErrorKind, message: string, status?: number, providerCode?: string) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.status = status;
    this.providerCode = providerCode;
  }

  /** True when the outcome of the call is unknown and must be reconciled before retrying. */
  get uncertain(): boolean {
    return this.kind === "timeout" || this.kind === "network" || this.kind === "server" || this.kind === "conflict";
  }
}

export interface PaymentProvider {
  readonly mode: ProviderMode;
  readonly keyId: string;
  createOrder(input: CreateOrderInput): Promise<ProviderOrder>;
  fetchOrder(orderId: string): Promise<ProviderOrder>;
  findOrdersByReceipt(receipt: string): Promise<ProviderOrder[]>;
  fetchOrderPayments(orderId: string): Promise<ProviderPayment[]>;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  createRefund(paymentId: string, input: CreateRefundInput, idempotencyKey: string): Promise<ProviderRefund>;
  fetchRefund(refundId: string): Promise<ProviderRefund>;
  fetchPaymentRefunds(paymentId: string): Promise<ProviderRefund[]>;
}
