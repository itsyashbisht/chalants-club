import { Container, Section } from "@/components/ui/container";

export default function Loading() {
  return (
    <Section>
      <Container>
        <p className="text-ink-2" role="status">
          Loading…
        </p>
      </Container>
    </Section>
  );
}
