"use client";

import { useEffect } from "react";
import { Container, Section } from "@/components/ui/container";
import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("route.error", error.digest ?? error.message);
  }, [error]);
  return (
    <Section>
      <Container narrow>
        <p className="text-meta font-semibold uppercase tracking-wide text-error">Something went wrong</p>
        <h1 className="text-title">We hit a problem loading this page</h1>
        <p className="mt-3 text-ink-2">Your booking and payments are safe; nothing is changed by a page error. Try again, or quote reference {error.digest ?? "n/a"} to support.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/contact" variant="secondary">
            Contact support
          </ButtonLink>
        </div>
      </Container>
    </Section>
  );
}
