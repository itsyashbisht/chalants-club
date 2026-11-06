import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env, isClerkConfigured } from "@/lib/env";

/** Clears the local dev-bypass cookies. With Clerk configured, sign-out is handled by Clerk's UserButton. */
export async function POST() {
  const jar = await cookies();
  jar.delete("dev_user_email");
  jar.delete("dev_user_name");
  return NextResponse.redirect(new URL(isClerkConfigured() ? "/" : "/", env().APP_URL), { status: 303 });
}
