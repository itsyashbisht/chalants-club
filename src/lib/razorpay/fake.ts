import {
  ProviderError,
  type CreateOrderInput,
  type CreateRefundInput,
  type PaymentProvider,
  type ProviderOrder,
  type ProviderPayment,
  type ProviderRefund,
} from "./provider";

/**
 * In-memory Razorpay stand-in for tests and local demos.
 * Supports scripted failures: `failNext('createOrder', 'timeout')` makes the next call throw after recording side effects
 * (to simulate a lost response), mirroring what a real timeout looks like.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly mode = "test" as const;
  readonly keyId = "rzp_test_fake";
  readonly keySecret = "fake_key_secret";

  orders = new Map<string, ProviderOrder>();
  payments = new Map<string, ProviderPayment>();
  refunds = new Map<string, ProviderRefund>();
  refundIdempotency = new Map<string, string>();
  calls: Array<{ op: string; args: unknown[] }> = [];

  private failures = new Map<string, ProviderError["kind"][]>();
  private counter = 0;

  failNext(op: keyof PaymentProvider, kind: ProviderError["kind"]) {
    const list = this.failures.get(op) ?? [];
    list.push(kind);
    this.failures.set(op, list);
  }

  private maybeFail(op: string) {
    const list = this.failures.get(op);
    if (list && list.length) {
      const kind = list.shift()!;
      throw new ProviderError(kind, `scripted ${kind} for ${op}`, kind === "conflict" ? 409 : kind === "server" ? 500 : undefined);
    }
  }

  private nextId(prefix: string) {
    this.counter += 1;
    return `${prefix}_${this.counter.toString().padStart(6, "0")}${Math.random().toString(36).slice(2, 8)}`;
  }

  async createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    this.calls.push({ op: "createOrder", args: [input] });
    const order: ProviderOrder = {
      id: this.nextId("order"),
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      status: "created",
      notes: input.notes,
    };
    this.orders.set(order.id, order);
    // Side effect recorded before a scripted failure: simulates a lost response.
    this.maybeFail("createOrder");
    return order;
  }

  async fetchOrder(orderId: string): Promise<ProviderOrder> {
    this.maybeFail("fetchOrder");
    const order = this.orders.get(orderId);
    if (!order) throw new ProviderError("not_found", "order not found", 404);
    return order;
  }

  async findOrdersByReceipt(receipt: string): Promise<ProviderOrder[]> {
    this.maybeFail("findOrdersByReceipt");
    return [...this.orders.values()].filter((o) => o.receipt === receipt);
  }

  async fetchOrderPayments(orderId: string): Promise<ProviderPayment[]> {
    this.maybeFail("fetchOrderPayments");
    return [...this.payments.values()].filter((p) => p.order_id === orderId);
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    this.maybeFail("fetchPayment");
    const payment = this.payments.get(paymentId);
    if (!payment) throw new ProviderError("not_found", "payment not found", 404);
    return payment;
  }

  async createRefund(paymentId: string, input: CreateRefundInput, idempotencyKey: string): Promise<ProviderRefund> {
    this.calls.push({ op: "createRefund", args: [paymentId, input, idempotencyKey] });
    const existingId = this.refundIdempotency.get(idempotencyKey);
    if (existingId) return this.refunds.get(existingId)!;
    const payment = this.payments.get(paymentId);
    if (!payment) throw new ProviderError("not_found", "payment not found", 404);
    const alreadyRefunded = [...this.refunds.values()]
      .filter((r) => r.payment_id === paymentId && r.status !== "failed")
      .reduce((sum, r) => sum + r.amount, 0);
    if (alreadyRefunded + input.amount > payment.amount) {
      throw new ProviderError("bad_request", "The refund amount provided is greater than amount captured", 400, "BAD_REQUEST_ERROR");
    }
    const refund: ProviderRefund = {
      id: this.nextId("rfnd"),
      payment_id: paymentId,
      amount: input.amount,
      currency: payment.currency,
      status: "processed",
      receipt: input.receipt,
      notes: input.notes,
      created_at: Math.floor(Date.now() / 1000),
    };
    this.refunds.set(refund.id, refund);
    this.refundIdempotency.set(idempotencyKey, refund.id);
    if (refund.amount === payment.amount) payment.status = "refunded";
    this.maybeFail("createRefund");
    return refund;
  }

  async fetchRefund(refundId: string): Promise<ProviderRefund> {
    this.maybeFail("fetchRefund");
    const refund = this.refunds.get(refundId);
    if (!refund) throw new ProviderError("not_found", "refund not found", 404);
    return refund;
  }

  async fetchPaymentRefunds(paymentId: string): Promise<ProviderRefund[]> {
    this.maybeFail("fetchPaymentRefunds");
    return [...this.refunds.values()].filter((r) => r.payment_id === paymentId);
  }

  // ---- Test helpers that simulate what a customer does in Checkout.

  /** Simulates a successful captured payment against an order. Returns the payment entity. */
  capture(orderId: string, overrides: Partial<ProviderPayment> = {}): ProviderPayment {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`fake: unknown order ${orderId}`);
    const payment: ProviderPayment = {
      id: this.nextId("pay"),
      order_id: orderId,
      amount: order.amount,
      currency: order.currency,
      status: "captured",
      captured: true,
      method: "upi",
      email: null,
      error_code: null,
      error_description: null,
      created_at: Math.floor(Date.now() / 1000),
      ...overrides,
    };
    this.payments.set(payment.id, payment);
    if (payment.status === "captured") order.status = "paid";
    else if (order.status === "created") order.status = "attempted";
    return payment;
  }

  fail(orderId: string): ProviderPayment {
    return this.capture(orderId, { status: "failed", captured: false, error_code: "BAD_REQUEST_ERROR", error_description: "Payment failed" });
  }

  /** Simulates a dashboard-initiated refund that the app did not create. */
  dashboardRefund(paymentId: string, amount: number): ProviderRefund {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error(`fake: unknown payment ${paymentId}`);
    const refund: ProviderRefund = {
      id: this.nextId("rfnd"),
      payment_id: paymentId,
      amount,
      currency: payment.currency,
      status: "processed",
      receipt: null,
      notes: {},
      created_at: Math.floor(Date.now() / 1000),
    };
    this.refunds.set(refund.id, refund);
    return refund;
  }
}
