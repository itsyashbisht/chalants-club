"use client";

import { useId, useState } from "react";
import { api, errorText } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Checkbox, FieldError, Input, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

/** Sold-out departures collect interest with explicit consent. The response is the same whether or not the email was already listed. */
export function WaitlistForm({ departureId }: { departureId: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  if (state === "done") {
    return (
      <Notice tone="success" title="You’re on the list">
        <p className="mt-1">If a seat opens we’ll email you an invitation to book through the usual steps.</p>
      </Notice>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (!consent) {
          setError("Please agree to be contacted about this departure.");
          return;
        }
        setState("busy");
        try {
          await api(`/api/departures/${departureId}/waitlist`, { body: { email, name: name || undefined, consent: true } });
          setState("done");
        } catch (err: unknown) {
          setError(errorText(err));
          setState("idle");
        }
      }}
      noValidate
    >
      <div>
        <Label htmlFor="wl-email">Email</Label>
        <Input id="wl-email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="wl-name">Name (optional)</Label>
        <Input id="wl-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <Checkbox id="wl-consent" label="Email me if a seat opens on this departure. I can ask to be removed at any time." checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-describedby={error ? errorId : undefined} />
      <FieldError id={errorId}>{error}</FieldError>
      <Button type="submit" disabled={state === "busy"}>
        {state === "busy" ? "Joining…" : "Join the waitlist"}
      </Button>
    </form>
  );
}
