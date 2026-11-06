import type { ReactNode } from "react";

/** Page container: 16/32/48 px gutters and the 1480 px maximum. `narrow` is the 760 px reading column. */
export function Container({ children, className = "", narrow = false }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return <div className={`mx-auto w-full px-4 md:px-8 lg:px-12 ${narrow ? "max-w-prose" : "max-w-page"} ${className}`}>{children}</div>;
}

export function Section({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`py-12 md:py-16 ${className}`}>
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-meta font-semibold uppercase tracking-wide text-ink-2">{children}</p>;
}

export function Rule({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-rule ${className}`} />;
}

/**
 * Reading layout for content pages: a 760 px prose column with a sticky aside (photos, facts, actions)
 * so wide screens are not left empty. The aside drops below the content on small screens.
 */
export function TwoColumn({ children, aside, className = "" }: { children: ReactNode; aside: ReactNode; className?: string }) {
  return (
    <Container className={`grid gap-10 lg:grid-cols-[minmax(0,760px)_minmax(320px,1fr)] lg:gap-16 ${className}`}>
      <div className="min-w-0">{children}</div>
      <aside className="lg:sticky lg:top-6 lg:self-start">{aside}</aside>
    </Container>
  );
}
