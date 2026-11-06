import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/server";
import { Container, Section, Eyebrow } from "@/components/ui/container";
import { ResultView } from "@/features/quiz/result-view";

export const metadata: Metadata = { title: "Your matches", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function QuizResultPage() {
  const user = await getCurrentUser().catch(() => null);
  return (
    <Section>
      <Container>
        <Eyebrow>Your result</Eyebrow>
        <h1 className="mb-8 text-title">Here’s where you’d fit</h1>
        <ResultView signedIn={Boolean(user)} />
      </Container>
    </Section>
  );
}
