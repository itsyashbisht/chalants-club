import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

/** Routes that need a signed-in user. API routes return 401 JSON instead of redirecting. */
const isProtectedPage = createRouteMatcher(["/book(.*)", "/account(.*)", "/admin(.*)"]);
const isProtectedApi = createRouteMatcher(["/api/bookings(.*)", "/api/admin(.*)", "/api/circle(.*)", "/api/quiz/save"]);

const withClerk = clerkMiddleware(async (auth, req) => {
  if (isProtectedApi(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } },
        { status: 401, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.next();
  }
  if (isProtectedPage(req)) {
    await auth.protect();
  }
  return NextResponse.next();
});

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (!clerkConfigured) return NextResponse.next();
  return withClerk(req, event);
}

export const config = {
  matcher: [
    // Run on everything except static assets, the provider webhook and the scheduler endpoint.
    "/((?!_next|api/webhooks|api/internal|.*\\.(?:ico|png|jpg|jpeg|svg|webp|css|js|map|txt|woff2?)$).*)",
  ],
};
