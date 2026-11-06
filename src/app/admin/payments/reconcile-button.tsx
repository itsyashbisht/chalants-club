"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/client/api";
import { Button } from "@/components/ui/button";

/** Finance action: re-fetch canonical provider state or retry a refund with its original request. */
export function ReconcileButton({ kind, id, label }: { kind: "order" | "payment" | "refund"; id: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="secondary"
        className="min-h-9 px-3 py-1 text-meta"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setResult(null);
          try {
            const { data } = await api<Record<string, unknown>>(`/api/admin/payments/${id}/reconcile`, { body: { kind } });
            setResult(kind === "refund" ? `→ ${String(data.state)}` : kind === "order" ? `captured ${String(data.captured)}` : "synced");
            router.refresh();
          } catch (err: unknown) {
            setResult(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "…" : (label ?? "Reconcile")}
      </Button>
      {result ? <span className="text-meta text-ink-2">{result}</span> : null}
    </span>
  );
}
