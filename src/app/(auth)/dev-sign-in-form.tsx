import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDevAuthBypassEnabled } from "@/lib/env";
import { safeReturnPath } from "@/lib/auth/pages";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

/** Local-only sign-in used when Clerk is not configured. The server action refuses to run unless the bypass is enabled. */
export function DevSignInForm({ returnTo }: { returnTo: string }) {
  async function signIn(formData: FormData) {
    "use server";
    if (!isDevAuthBypassEnabled()) throw new Error("Dev sign-in is disabled.");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const name = String(formData.get("name") ?? "").trim();
    const target = safeReturnPath(String(formData.get("returnTo") ?? ""));
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error("Enter a valid email.");
    const jar = await cookies();
    jar.set("dev_user_email", email, { httpOnly: true, sameSite: "lax", path: "/" });
    if (name) jar.set("dev_user_name", name, { httpOnly: true, sameSite: "lax", path: "/" });
    redirect(target);
  }
  return (
    <form action={signIn} className="grid gap-4 rounded-control border border-rule bg-surface p-5">
      <input type="hidden" name="returnTo" value={returnTo} />
      <div>
        <Label htmlFor="dev-email" hint="Seeded staff: operator@example.test, reviewer@example.test, finance@example.test, host@example.test">
          Email
        </Label>
        <Input id="dev-email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <Label htmlFor="dev-name">Name (optional)</Label>
        <Input id="dev-name" name="name" autoComplete="name" />
      </div>
      <Button type="submit">Continue</Button>
    </form>
  );
}
