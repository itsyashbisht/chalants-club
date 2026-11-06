import "@/lib/server-guard";
import { and, eq } from "drizzle-orm";
import type { Clock } from "@/lib/clock";
import { getDb, type Db } from "@/lib/db/client";
import { withClockTx, retryTx } from "@/lib/db/tx";
import { paymentsConfig } from "@/lib/env";
import { errors } from "@/lib/errors";
import { log } from "@/lib/logger";
import { ProviderError, type PaymentProvider } from "@/lib/razorpay/provider";
import { getPaymentProvider } from "@/lib/razorpay/client";
import { verifyCheckoutSignature } from "@/lib/razorpay/signature";
import { bookings } from "@/features/bookings/schema";
import { gatewayOrders, instalments } from "./schema";
import { recordProviderPayment, type ApplyOutcome } from "./allocation";

type Deps = { clock?: Clock; db?: Db; provider?: PaymentProvider; keySecret?: string };

export type VerifyResult =
  | { status: "captured"; bookingState: string; outcome: ApplyOutcome }
  | { status: "pending"; reason: "authorized" | "unknown" | "provider_unavailable" | "quarantined" }
  | { status: "failed"; errorDescription: string | null };

/**
 * Confirms a Checkout response: resolves the expected order for this booking on the server, verifies the
 * HMAC signature with the key secret, then fetches the payment with server credentials and requires its order,
 * currency, amount and captured status before applying it through the shared allocation path.
 */
export async function verifyCheckoutResponse(
  input: { bookingId: string; userId: string; orderId: string; paymentId: string; signature: string },
  deps: Deps = {},
): Promise<VerifyResult> {
  const provider = deps.provider ?? getPaymentProvider();
  const db = deps.db ?? getDb();
  const keySecret = deps.keySecret ?? resolveKeySecret();

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
  if (!booking || booking.ownerId !== input.userId) throw errors.notFound("Booking not found.");

  const [order] = await db
    .select()
    .from(gatewayOrders)
    .where(and(eq(gatewayOrders.bookingId, booking.id), eq(gatewayOrders.providerOrderId, input.orderId), eq(gatewayOrders.mode, provider.mode)))
    .limit(1);
  if (!order) throw errors.conflict("ORDER_MISMATCH", "This payment does not belong to the current booking step.");

  if (!verifyCheckoutSignature({ keySecret, orderId: order.providerOrderId!, paymentId: input.paymentId, signature: input.signature })) {
    log.warn("verify.invalid_signature", { bookingId: booking.id, gatewayOrderId: order.id });
    throw errors.invalid("The payment confirmation could not be verified.");
  }

  let payment;
  try {
    payment = await provider.fetchPayment(input.paymentId);
  } catch (error: unknown) {
    if (error instanceof ProviderError && error.kind === "not_found") return { status: "pending", reason: "unknown" };
    log.warn("verify.fetch_failed", { bookingId: booking.id, error });
    return { status: "pending", reason: "provider_unavailable" };
  }

  if (payment.order_id !== order.providerOrderId) throw errors.conflict("ORDER_MISMATCH", "The payment does not match the expected order.");
  if (payment.currency !== "INR") return quarantine(db, provider, payment, deps, "currency");
  const [instalment] = await db.select().from(instalments).where(eq(instalments.id, order.instalmentId)).limit(1);
  if (!instalment || payment.amount !== instalment.amountPaise) return quarantine(db, provider, payment, deps, "amount");

  if (payment.status === "failed") {
    await retryTx(() => withClockTx((tx, now) => recordProviderPayment(tx, { mode: provider.mode, payment, source: "callback", now }), deps));
    return { status: "failed", errorDescription: payment.error_description };
  }
  if (payment.status !== "captured" && payment.status !== "refunded") {
    await retryTx(() => withClockTx((tx, now) => recordProviderPayment(tx, { mode: provider.mode, payment, source: "callback", now }), deps));
    return { status: "pending", reason: "authorized" };
  }

  const { result } = await retryTx(() => withClockTx((tx, now) => recordProviderPayment(tx, { mode: provider.mode, payment, source: "callback", now }), deps));
  const [fresh] = await db.select({ state: bookings.state }).from(bookings).where(eq(bookings.id, booking.id)).limit(1);
  return { status: "captured", bookingState: fresh?.state ?? booking.state, outcome: result };
}

async function quarantine(db: Db, provider: PaymentProvider, payment: { id: string; order_id: string | null; amount: number; currency: string; status: string }, deps: Deps, why: string): Promise<VerifyResult> {
  log.warn("verify.quarantine", { paymentId: payment.id, why });
  // Recording through the shared path creates the mismatch allocation and finance alert.
  await retryTx(() => withClockTx((tx, now) => recordProviderPayment(tx, { mode: provider.mode, payment, source: "callback", now }), { clock: deps.clock, db }));
  return { status: "pending", reason: "quarantined" };
}

function resolveKeySecret(): string {
  const cfg = paymentsConfig();
  if (!cfg.ok) throw errors.unavailable("PAYMENTS_NOT_CONFIGURED", "Payments are not configured yet.");
  return cfg.keySecret;
}
