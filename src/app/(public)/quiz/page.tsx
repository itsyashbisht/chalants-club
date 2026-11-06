import type { Metadata } from "next";
import { PHOTOS } from "@/content/site";
import { Container, Section } from "@/components/ui/container";
import { Photo } from "@/components/ui/photo";
import { QuizFlow } from "@/features/quiz/quiz-flow";

export const metadata: Metadata = { title: "Find my travel circle" };

export default function QuizPage() {
  return (
    <Section>
      <Container className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="hidden lg:col-span-5 lg:block">
          <div className="sticky top-6 grid gap-4">
            <Photo photo={PHOTOS.heroSecondary} aspect="aspect-[4/5]" sizes="40vw" />
            <div className="rounded-card bg-poster p-5 text-ink">
              <p className="text-meta font-semibold uppercase tracking-widest">Nine questions</p>
              <p className="mt-2 font-display text-2xl font-bold leading-tight">How you like a day to go, not who you are.</p>
              <p className="mt-2 text-meta">Answers stay in this tab. The one about what you hope for never leaves your browser.</p>
            </div>
          </div>
        </div>
        <div className="lg:col-span-7">
          <QuizFlow />
        </div>
      </Container>
    </Section>
  );
}
