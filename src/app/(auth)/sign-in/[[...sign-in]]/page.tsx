import type { Metadata } from "next";
import { Container, Section, Eyebrow } from "@/components/ui/container";
import { Notice } from "@/components/ui/notice";
import { isClerkConfigured, isDevAuthBypassEnabled } from "@/lib/env";
import { safeReturnPath } from "@/lib/auth/pages";
import { DevSignInForm } from "../../dev-sign-in-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const returnTo = safeReturnPath(typeof params.redirect_url === "string" ? params.redirect_url : null);
  if (isClerkConfigured()) {
    const { SignIn } = await import("@clerk/nextjs");
    return (
      <Section>
        <Container narrow className="flex justify-center">
          <SignIn fallbackRedirectUrl={returnTo} signUpFallbackRedirectUrl={returnTo} />
        </Container>
      </Section>
    );
  }
  return (
    <Section>
      <Container narrow>
        <Eyebrow>Sign in</Eyebrow>
        <h1 className="text-title">Secure your account</h1>
        {isDevAuthBypassEnabled() ? (
          <div className="mt-6">
            <Notice tone="attention" title="Local development sign-in">Clerk is not configured. This form sets a local cookie so you can test the booking flow. It is disabled in production.</Notice>
            <div className="mt-6">
              <DevSignInForm returnTo={returnTo} />
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <Notice tone="attention" title="Sign-in is not configured yet">Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to enable accounts. You can still browse trips and play the quiz.</Notice>
          </div>
        )}
      </Container>
    </Section>
  );
}
