import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

/** Wraps the app in ClerkProvider when Clerk keys are configured; otherwise renders children directly. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  if (!configured) return <>{children}</>;
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      appearance={{
        variables: {
          colorPrimary: "#FF5E1A",
          borderRadius: "12px",
          fontFamily: "var(--font-dm-sans), DM Sans, system-ui, sans-serif",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
