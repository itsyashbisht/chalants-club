import { Container, Section } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Section>
      <Container narrow>
        <p className="text-meta font-semibold uppercase tracking-wide text-ink-2">404</p>
        <h1 className="text-title">We couldn’t find that page</h1>
        <p className="mt-3 text-ink-2">The link may be old, or the booking may belong to a different account.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/trips">Browse trips</ButtonLink>
          <ButtonLink href="/account/bookings" variant="secondary">
            My bookings
          </ButtonLink>
        </div>
      </Container>
    </Section>
  );
}
