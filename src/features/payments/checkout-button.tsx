"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, errorText } from "@/lib/client/api";
import { formatInr } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { CheckoutConfig } from "./orders";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, handler: (r: unknown) => void) => void };
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckoutScript(): Promise<RazorpayCtor> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.addEventListener("load", () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Checkout failed to initialise"))));
    script.addEventListener("error", () => reject(new Error("Could not load the payment window. Check your connection or a script blocker, then try again.")));
    if (!existing) document.head.appendChild(script);
  });
}

type Phase = "idle" | "creating" | "open" | "verifying" | "pending" | "done" | "failed" | "dismissed" | "error";

/**
 * Opens Razorpay Standard Checkout for one instalment. Creates (or reuses) the server order, verifies the response
 * on the server, and polls the owner-scoped status endpoint while a capture is unresolved.
 */
export function CheckoutButton({ bookingId, instalment, amountPaise, label }: { bookingId: string; instalment: "deposit" | "balance"; amountPaise: number; label?: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pollTimer = useRef<number | null>(null);

  useEffect(() => () => void (pollTimer.current && window.clearTimeout(pollTimer.current)), []);

  const poll = (attempt = 0) => {
    const delay = Math.min(15_000, 1_500 * 2 ** Math.min(attempt, 4));
    pollTimer.current = window.setTimeout(async () => {
      try {
        const { data } = await api<{ state: string; pendingCapture: boolean }>(`/api/bookings/${bookingId}`);
        const settled = (instalment === "deposit" && data.state !== "HELD") || (instalment === "balance" && data.state !== "BALANCE_DUE");
        if (settled) {
          setPhase("done");
          router.refresh();
          return;
        }
      } catch {
        // keep polling; the manual refresh fallback remains available
      }
      if (attempt < 12) poll(attempt + 1);
      else setMessage("Still checking. Refresh this page in a minute, or contact support with your booking reference before paying again.");
    }, delay);
  };

  const start = async () => {
    setMessage(null);
    setPhase("creating");
    try {
      let checkout: CheckoutConfig | null = null;
      for (let i = 0; i < 5 && !checkout; i += 1) {
        const { status, data } = await api<{ status: "ready" | "processing"; checkout?: CheckoutConfig; retryAfterSeconds?: number }>(`/api/bookings/${bookingId}/orders`, { body: { instalment } });
        if (status === 200 && data.checkout) checkout = data.checkout;
        else await new Promise((r) => setTimeout(r, (data.retryAfterSeconds ?? 2) * 1000));
      }
      if (!checkout) throw new Error("The payment is still being prepared. Please try again in a moment.");
      const Razorpay = await loadCheckoutScript();
      setPhase("open");
      const rzp = new Razorpay({
        key: checkout.keyId,
        order_id: checkout.orderId,
        amount: checkout.amountPaise,
        currency: checkout.currency,
        name: checkout.name,
        description: checkout.description,
        prefill: checkout.prefill,
        notes: checkout.notes,
        theme: { color: "#FF5E1A" },
        retry: { enabled: false },
        modal: {
          ondismiss: () => {
            setPhase("dismissed");
            setMessage("Payment not completed. Your seat hold is unchanged; you can try again while it lasts.");
            buttonRef.current?.focus();
          },
        },
        handler: async (response: RazorpayResponse) => {
          setPhase("verifying");
          try {
            const { status, data } = await api<{ status: string; reason?: string; bookingState?: string; errorDescription?: string | null }>(`/api/bookings/${bookingId}/payments/verify`, { body: response });
            if (status === 202 || data.status === "pending") {
              setPhase("pending");
              setMessage("Checking your payment with the bank. This page updates automatically. Please don’t pay again.");
              poll();
              return;
            }
            if (data.status === "failed") {
              setPhase("failed");
              setMessage(data.errorDescription ? `Payment failed: ${data.errorDescription}` : "Payment failed. No money was taken. You can try again.");
              return;
            }
            setPhase("done");
            router.refresh();
          } catch (err: unknown) {
            setPhase("error");
            setMessage(errorText(err));
          }
        },
      });
      rzp.on("payment.failed", (r: unknown) => {
        const desc = (r as { error?: { description?: string } })?.error?.description;
        setPhase("failed");
        setMessage(desc ? `Payment failed: ${desc}` : "Payment failed. No money was taken.");
        buttonRef.current?.focus();
      });
      rzp.open();
    } catch (err: unknown) {
      setPhase("error");
      if (err instanceof ApiError && err.code === "PAYMENTS_NOT_CONFIGURED") {
        setMessage("Payments aren’t configured on this environment yet. Razorpay test keys are required to continue.");
      } else {
        setMessage(errorText(err));
      }
      buttonRef.current?.focus();
    }
  };

  const busy = phase === "creating" || phase === "open" || phase === "verifying" || phase === "pending";
  const text = label ?? `Pay ${formatInr(amountPaise)} ${instalment}`;

  return (
    <div className="grid gap-3">
      <Button ref={buttonRef} size="lg" onClick={start} disabled={busy} aria-busy={busy}>
        {phase === "creating" ? "Preparing payment…" : phase === "verifying" ? "Confirming payment…" : phase === "pending" ? "Checking your payment…" : phase === "done" ? "Payment received" : text}
      </Button>
      <p className="sr-only" aria-live="polite">
        {phase === "pending" ? "Checking your payment." : phase === "done" ? "Payment received." : ""}
      </p>
      {message ? (
        <Notice tone={phase === "pending" ? "attention" : phase === "done" ? "success" : "error"} live={phase !== "pending"}>
          <p>{message}</p>
          {phase === "pending" ? (
            <button type="button" className="mt-2 underline" onClick={() => router.refresh()}>
              Refresh status now
            </button>
          ) : null}
        </Notice>
      ) : null}
    </div>
  );
}
