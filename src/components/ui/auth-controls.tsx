import Link from "next/link";
import { cookies } from "next/headers";

/** Sign-in/out controls. Uses Clerk's components when configured; otherwise the local dev-bypass cookie. */
export async function AuthControls() {
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  if (clerkConfigured) {
    const { SignedIn, SignedOut, UserButton } = await import("@clerk/nextjs");
    return (
      <>
        <SignedOut>
          <Link href="/sign-in" className="font-semibold hover:underline">
            Sign in
          </Link>
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </>
    );
  }
  const devBypass = process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_BYPASS === "true";
  if (!devBypass) {
    return (
      <Link href="/sign-in" className="font-semibold hover:underline">
        Sign in
      </Link>
    );
  }
  const jar = await cookies();
  const email = jar.get("dev_user_email")?.value;
  if (!email) {
    return (
      <Link href="/sign-in" className="font-semibold hover:underline">
        Sign in
      </Link>
    );
  }
  return (
    <form action="/sign-out" method="post" className="flex items-center gap-3">
      <span className="text-meta text-ink-2">{email}</span>
      <button type="submit" className="font-semibold hover:underline">
        Sign out
      </button>
    </form>
  );
}
