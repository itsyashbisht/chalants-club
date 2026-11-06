import Link from "next/link";
import { Container } from "./container";
import { AuthControls } from "./auth-controls";

const nav = [
  { href: "/trips", label: "Trips" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/safety", label: "Safety" },
  { href: "/about", label: "About" },
  { href: "/account/bookings", label: "My bookings" },
];

/** Site navigation with a no-JS mobile menu (details/summary) so it works when scripts are blocked. */
export function SiteHeader() {
  return (
    <header className="border-b border-rule bg-paper">
      <Container className="flex min-h-16 items-center justify-between gap-6 py-3">
        <Link href="/" className="font-display text-xl font-bold tracking-tight">
          Chalants Club
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="py-2 font-semibold hover:underline">
              {item.label}
            </Link>
          ))}
          <AuthControls />
        </nav>
        <details className="relative md:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-full border-2 border-outline px-5 font-bold [&::-webkit-details-marker]:hidden">Menu</summary>
          <nav aria-label="Primary (mobile)" className="absolute right-0 z-40 mt-2 flex w-64 flex-col rounded-card border border-rule bg-surface p-2 shadow-sm">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-control px-4 py-3 font-semibold hover:bg-tint">
                {item.label}
              </Link>
            ))}
            <div className="px-4 py-3">
              <AuthControls />
            </div>
          </nav>
        </details>
      </Container>
    </header>
  );
}
