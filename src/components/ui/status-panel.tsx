import type { ReactNode } from "react";
import type { Tone } from "./notice";

const toneClass: Record<Tone, string> = { success: "border-success", attention: "border-attention", error: "border-error", neutral: "border-rule" };
const toneText: Record<Tone, string> = { success: "text-success", attention: "text-attention", error: "text-error", neutral: "text-ink-2" };

/** Every booking state gets a plain-language heading, the amount that matters, the next action and a support link. */
export function StatusPanel({ tone, heading, body, amountLabel, amount, action, support, children }: { tone: Tone; heading: string; body: string; amountLabel?: string; amount?: string; action?: ReactNode; support?: ReactNode; children?: ReactNode }) {
  return (
    <section aria-labelledby="status-heading" className={`rounded-editorial border-2 ${toneClass[tone]} bg-surface p-6 md:p-8`}>
      <p className={`text-meta font-semibold uppercase tracking-wide ${toneText[tone]}`}>Status</p>
      <h2 id="status-heading" className="mt-2 text-section">
        {heading}
      </h2>
      <p className="prose-measure mt-3 text-ink-2">{body}</p>
      {amount ? (
        <p className="mt-5 text-meta font-semibold uppercase tracking-wide text-ink-2">
          {amountLabel}
          <span className="tabular mt-1 block text-3xl font-bold normal-case tracking-normal text-ink">{amount}</span>
        </p>
      ) : null}
      {children}
      {action ? <div className="mt-6 flex flex-wrap gap-3">{action}</div> : null}
      {support ? <p className="mt-5 text-meta text-ink-2">{support}</p> : null}
    </section>
  );
}
