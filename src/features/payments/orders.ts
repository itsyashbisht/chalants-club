import "@/lib/server-guard";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Clock } from "@/lib/clock";
import { getDb, type Db } from "@/lib/db/client";
import { withClockTx } from "@/lib/db/tx";
import { env } from "@/lib/env";
import { errors } from "@/lib/errors";
import { log } from "@/lib/logger";
import { formatDateRange } from "@/lib/time";
import { audit } from "@/lib/audit";
import { ProviderError, type PaymentProvider } from "@/lib/razorpay/provider";
import { getPaymentProvider } from "@/lib/razorpay/client";
import { users } from "@/lib/db/core-schema";
import { trips } from "@/features/trips/schema";
import { lockBookingChain } from "@/features/bookings/locks";
import { gatewayOrders, instalments, type InstalmentKind } from "./schema";

export type CheckoutConfig = {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: "INR";
  name: string;
  description: string;
  prefill: { name?: string; email?: string };
  notes: { booking_reference: string };
  bookingId: string;
  instalment: InstalmentKind;
  reference: string;
  mode: "test" | "live";
};

export type CreateOrderResult = { status: "ready"; checkout: CheckoutConfig } | { status: "processing"; retryAfterSeconds: number };

type Deps = { clock?: Clock; db?: Db; provider?: PaymentProvider };

const LEASE_SECONDS = 60;

/**
 * Returns Checkout configuration for a booking instalment, creating a provider order when needed.
 * Ownership, booking stage and deadlines are verified on every call. A replay reuses the payable order.
 * Postgres locks are never held across the provider call.
 */
export async function createCheckoutOrder(input: { bookingId: string; kind: InstalmentKind; userId: string }, deps: Deps = {}): Promise<CreateOrderResult> {
  const provider = deps.provider ?? getPaymentProvider();
  const db = deps.db ?? getDb();

  // Step 1: validate and reserve the local operation transactionally.
  const reservation = await withClockTx(async (tx, now) => {
    const { departure, booking } = await lockBookingChain(tx, input.bookingId);
    if (booking.ownerId !== input.userId) throw errors.notFound("Booking not found.");

    if (input.kind === "deposit") {
      if (booking.state !== "HELD") throw errors.conflict("WRONG_STAGE", "The deposit stage is not open for this booking.");
      if (!booking.holdExpiresAt || booking.holdExpiresAt.getTime() <= now.getTime()) throw errors.conflict("HOLD_EXPIRED", "Your seat hold has expired. Please start a new booking.");
    } else {
      if (booking.state !== "BALANCE_DUE") throw errors.conflict("WRONG_STAGE", "The balance can be paid only after approval.");
      if (!booking.balanceDueAt || booking.balanceDueAt.getTime() <= now.getTime()) throw errors.conflict("BALANCE_EXPIRED", "The balance window has closed.");
    }

    const [instalment] = await tx.select().from(instalments).where(and(eq(instalments.bookingId, booking.id), eq(instalments.kind, input.kind))).limit(1);
    if (!instalment) throw errors.conflict("WRONG_STAGE", "This instalment is not available yet.");
    if (instalment.status !== "pending") throw errors.conflict("ALREADY_PAID", "This instalment has already been paid.");

    const existing = await tx
      .select()
      .from(gatewayOrders)
      .where(and(eq(gatewayOrders.instalmentId, instalment.id), inArray(gatewayOrders.requestState, ["leased", "created", "uncertain"])))
      .orderBy(desc(gatewayOrders.attempt));

    const [trip] = await tx.select().from(trips).where(eq(trips.id, departure.tripId)).limit(1);
    const [owner] = await tx.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, booking.ownerId)).limit(1);
    const display = {
      description: `${input.kind === "deposit" ? "Deposit" : "Balance"} · ${trip?.title ?? "Trip"} · ${formatDateRange(departure.startDate, departure.endDate)}`,
      prefill: { name: owner?.name ?? undefined, email: owner?.email ?? undefined },
      reference: booking.reference,
      bookingId: booking.id,
    };

    const created = existing.find((o) => o.requestState === "created" && o.providerOrderId);
    if (created) return { kind: "ready" as const, order: created, instalment, display };

    const leased = existing.find((o) => o.requestState === "leased" && o.leaseExpiresAt && o.leaseExpiresAt.getTime() > now.getTime());
    if (leased) return { kind: "processing" as const, display };

    const toReconcile = existing.find((o) => o.requestState === "uncertain" || o.requestState === "leased");
    if (toReconcile) return { kind: "reconcile" as const, order: toReconcile, instalment, display };

    const [latest] = await tx.select({ attempt: gatewayOrders.attempt }).from(gatewayOrders).where(eq(gatewayOrders.instalmentId, instalment.id)).orderBy(desc(gatewayOrders.attempt)).limit(1);
    const attempt = (latest?.attempt ?? 0) + 1;
    const receipt = `${booking.reference.toLowerCase()}-${input.kind === "deposit" ? "d" : "b"}-${attempt}`.slice(0, 40);
    const [order] = await tx
      .insert(gatewayOrders)
      .values({
        instalmentId: instalment.id,
        bookingId: booking.id,
        mode: provider.mode,
        receipt,
        operationKey: `${instalment.id}:${attempt}`,
        requestState: "leased",
        leaseExpiresAt: new Date(now.getTime() + LEASE_SECONDS * 1000),
        amountPaise: instalment.amountPaise,
        currency: "INR",
        attempt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await audit(tx, { actorType: "user", actorUserId: input.userId, operation: "order.leased", entityType: "gateway_order", entityId: order.id, metadata: { bookingId: booking.id, kind: input.kind, attempt } });
    return { kind: "create" as const, order, instalment, display };
  }, deps);

  if (reservation.kind === "processing") return { status: "processing", retryAfterSeconds: 3 };

  if (reservation.kind === "ready") {
    return { status: "ready", checkout: toCheckout(provider, reservation.order.providerOrderId!, reservation.order.amountPaise, reservation.display, input.kind) };
  }

  // Step 2: talk to the provider without holding locks.
  if (reservation.kind === "reconcile") {
    const resolved = await reconcileOrderByReceipt(db, provider, reservation.order.id, reservation.order.receipt);
    if (resolved) return { status: "ready", checkout: toCheckout(provider, resolved, reservation.order.amountPaise, reservation.display, input.kind) };
    // Nothing exists at the provider: the lease is void and the caller may retry to create a fresh order.
    return { status: "processing", retryAfterSeconds: 1 };
  }

  const { order, display } = reservation;
  try {
    const providerOrder = await provider.createOrder({
      amount: order.amountPaise,
      currency: "INR",
      receipt: order.receipt,
      notes: { booking_reference: display.reference, instalment: input.kind },
    });
    await db
      .update(gatewayOrders)
      .set({ providerOrderId: providerOrder.id, requestState: "created", leaseExpiresAt: null, updatedAt: new Date() })
      .where(eq(gatewayOrders.id, order.id));
    return { status: "ready", checkout: toCheckout(provider, providerOrder.id, order.amountPaise, display, input.kind) };
  } catch (error: unknown) {
    if (error instanceof ProviderError && error.uncertain) {
      log.warn("order.create_uncertain", { gatewayOrderId: order.id, kind: error.kind });
      await db.update(gatewayOrders).set({ requestState: "uncertain", lastError: error.message, updatedAt: new Date() }).where(eq(gatewayOrders.id, order.id));
      const resolved = await reconcileOrderByReceipt(db, provider, order.id, order.receipt);
      if (resolved) return { status: "ready", checkout: toCheckout(provider, resolved, order.amountPaise, display, input.kind) };
      return { status: "processing", retryAfterSeconds: 2 };
    }
    const message = error instanceof Error ? error.message : String(error);
    await db.update(gatewayOrders).set({ requestState: "void", lastError: message, updatedAt: new Date() }).where(eq(gatewayOrders.id, order.id));
    log.error("order.create_failed", { gatewayOrderId: order.id, error });
    throw errors.unavailable("PROVIDER_REJECTED", "We could not start the payment. Please try again in a moment.");
  }
}

/**
 * Looks the receipt up at the provider. Adopts the provider order when found (marks created), or voids the local
 * operation when the provider has nothing under that receipt. Returns the provider order ID when resolved.
 */
export async function reconcileOrderByReceipt(db: Db, provider: PaymentProvider, gatewayOrderId: string, receipt: string): Promise<string | null> {
  try {
    const found = await provider.findOrdersByReceipt(receipt);
    const match = found[0];
    if (match) {
      await db
        .update(gatewayOrders)
        .set({ providerOrderId: match.id, requestState: "created", leaseExpiresAt: null, lastError: null, updatedAt: new Date() })
        .where(eq(gatewayOrders.id, gatewayOrderId));
      return match.id;
    }
    await db.update(gatewayOrders).set({ requestState: "void", leaseExpiresAt: null, updatedAt: new Date() }).where(eq(gatewayOrders.id, gatewayOrderId));
    return null;
  } catch (error: unknown) {
    log.warn("order.reconcile_failed", { gatewayOrderId, error });
    return null;
  }
}

function toCheckout(
  provider: PaymentProvider,
  orderId: string,
  amountPaise: number,
  display: { description: string; prefill: { name?: string; email?: string }; reference: string; bookingId: string },
  kind: InstalmentKind,
): CheckoutConfig {
  return {
    keyId: provider.keyId,
    orderId,
    amountPaise,
    currency: "INR",
    name: env().OPERATOR_NAME,
    description: display.description,
    prefill: display.prefill,
    notes: { booking_reference: display.reference },
    bookingId: display.bookingId,
    instalment: kind,
    reference: display.reference,
    mode: provider.mode,
  };
}
