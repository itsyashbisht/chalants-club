"use client";

import { useId, useState } from "react";
import { api, errorText, ApiError } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

const categories = [
  ["booking", "My booking"],
  ["payment", "A payment"],
  ["refund", "A refund"],
  ["safety", "A safety concern or private report"],
  ["privacy", "Privacy or my data"],
  ["deletion", "Delete my account data"],
  ["other", "Something else"],
] as const;

export function SupportForm({ defaultEmail = "", bookingId }: { defaultEmail?: string; bookingId?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const errorId = useId();

  if (state === "done") {
    return (
      <Notice tone="success" title="We've got it">
        <p className="mt-1">Case reference {caseId?.slice(0, 8)}. A member of staff will reply by email. Safety reports are read by staff only.</p>
      </Notice>
    );
  }

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setState("busy");
        setError(null);
        setFieldErrors({});
        try {
          const { data } = await api<{ caseId: string }>("/api/support", {
            body: {
              email: form.get("email"),
              name: form.get("name") || undefined,
              category: form.get("category"),
              subject: form.get("subject"),
              message: form.get("message"),
              bookingId: bookingId || undefined,
            },
          });
          setCaseId(data.caseId);
          setState("done");
        } catch (err: unknown) {
          if (err instanceof ApiError && Array.isArray(err.details)) {
            setFieldErrors(Object.fromEntries((err.details as Array<{ path: string; message: string }>).map((d) => [d.path, d.message])));
          }
          setError(errorText(err));
          setState("idle");
        }
      }}
    >
      <div>
        <Label htmlFor="sp-email">Email</Label>
        <Input id="sp-email" name="email" type="email" autoComplete="email" required defaultValue={defaultEmail} invalid={Boolean(fieldErrors.email)} />
        <FieldError id="sp-email-error">{fieldErrors.email}</FieldError>
      </div>
      <div>
        <Label htmlFor="sp-name">Name (optional)</Label>
        <Input id="sp-name" name="name" autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="sp-category">What is this about?</Label>
        <Select id="sp-category" name="category" defaultValue="booking">
          {categories.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="sp-subject">Subject</Label>
        <Input id="sp-subject" name="subject" required maxLength={150} invalid={Boolean(fieldErrors.subject)} />
        <FieldError id="sp-subject-error">{fieldErrors.subject}</FieldError>
      </div>
      <div>
        <Label htmlFor="sp-message" hint="Include your booking reference if you have one. Don't include card or ID numbers.">
          Message
        </Label>
        <Textarea id="sp-message" name="message" required minLength={10} maxLength={4000} invalid={Boolean(fieldErrors.message)} />
        <FieldError id="sp-message-error">{fieldErrors.message}</FieldError>
      </div>
      <FieldError id={errorId}>{error}</FieldError>
      <Button type="submit" disabled={state === "busy"}>
        {state === "busy" ? "Sending…" : "Send to support"}
      </Button>
    </form>
  );
}
