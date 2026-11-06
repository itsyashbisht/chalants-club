import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container, Section } from "@/components/ui/container";
import { isClerkConfigured } from "@/lib/env";
import { safeReturnPath } from "@/lib/auth/pages";

export const metadata: Metadata = { title: "Create an account" };
export const dynamic = "force-dynamic";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const returnTo = safeReturnPath(typeof params.redirect_url === "string" ? params.redirect_url : null);
  if (!isClerkConfigured()) redirect(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
  const { SignUp } = await import("@clerk/nextjs");
  return (
    <Section>
      <Container narrow className="flex justify-center">
        <SignUp fallbackRedirectUrl={returnTo} signInFallbackRedirectUrl={returnTo} />
      </Container>
    </Section>
  );
}
