import Link from "next/link";
import type { ReactNode } from "react";
import { requirePageUser } from "@/lib/auth/pages";
import { isStaff } from "@/lib/auth/server";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/** Role-gated operator area. Signed-out users are sent to sign-in; signed-in non-staff see a 403. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser("/admin");
  if (!isStaff(user)) {
    return (
      <Container narrow className="py-16">
        <p className="text-meta font-semibold uppercase tracking-wide text-error">403</p>
        <h1 className="text-title">Staff only</h1>
        <p className="mt-3 text-ink-2">Your account ({user.email}) does not have a staff role. Role grants are made by an operator and audited.</p>
        <div className="mt-6">
          <ButtonLink href="/account/bookings" variant="secondary">
            My bookings
          </ButtonLink>
        </div>
      </Container>
    );
  }
  const links = [
    { href: "/admin/reviews", label: "Reviews", show: user.roles.includes("reviewer") || user.roles.includes("operator") },
    { href: "/admin/departures", label: "Departures", show: user.roles.includes("operator") || user.roles.includes("host") },
    { href: "/admin/payments", label: "Payments", show: user.roles.includes("finance") || user.roles.includes("operator") },
  ].filter((l) => l.show);
  return (
    <div className="bg-paper">
      <div className="border-b border-rule bg-surface">
        <Container className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
          <span className="text-meta font-semibold uppercase tracking-wide text-ink-2">Admin · {user.roles.join(", ")}</span>
          <nav aria-label="Admin" className="flex flex-wrap gap-4">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="font-semibold hover:underline">
                {l.label}
              </Link>
            ))}
          </nav>
        </Container>
      </div>
      <Container className="py-8">{children}</Container>
    </div>
  );
}
