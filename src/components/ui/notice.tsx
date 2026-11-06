import type { ReactNode } from "react";

export type Tone = "success" | "attention" | "error" | "neutral";

const tones: Record<Tone, { border: string; text: string; icon: string }> = {
  success: { border: "border-success", text: "text-success", icon: "✓" },
  attention: { border: "border-attention", text: "text-attention", icon: "!" },
  error: { border: "border-error", text: "text-error", icon: "×" },
  neutral: { border: "border-rule", text: "text-ink-2", icon: "·" },
};

/** Inline message paired with an icon and heading. Use `role="alert"` for errors via `live`. */
export function Notice({ tone = "neutral", title, children, live = false }: { tone?: Tone; title?: string; children?: ReactNode; live?: boolean }) {
  const t = tones[tone];
  return (
    <div role={live ? "alert" : undefined} aria-live={live ? undefined : "polite"} className={`flex gap-3 rounded-control border-2 ${t.border} bg-surface px-4 py-3`}>
      <span aria-hidden className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${t.border} ${t.text} text-sm font-bold`}>
        {t.icon}
      </span>
      <div className="min-w-0">
        {title ? <p className={`font-semibold ${t.text}`}>{title}</p> : null}
        {children ? <div className="text-ink">{children}</div> : null}
      </div>
    </div>
  );
}
