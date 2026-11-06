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

/**
 * Site navigation. On small screens a hamburger button opens a full-width panel; it is a native
 * details/summary so it works without JavaScript and closes with the same button.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/95 backdrop-blur">
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
        <details className="group md:hidden">
          <summary
            aria-label="Open menu"
            className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full border-2 border-ink text-ink [&::-webkit-details-marker]:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden className="group-open:hidden">
              <path d="M3 6h16M3 11h16M3 16h16" />
            </svg>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden className="hidden group-open:block">
              <path d="M5 5l12 12M17 5L5 17" />
            </svg>
          </summary>
          <nav aria-label="Primary (mobile)" className="absolute inset-x-0 top-full border-b border-rule bg-paper px-4 pb-6 pt-2 shadow-[0_14px_36px_rgba(43,18,10,0.16)]">
            <ul className="divide-y divide-rule">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="block py-4 font-display text-2xl font-bold hover:text-action">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between gap-3">
              <AuthControls />
              <Link href="/quiz" className="inline-flex min-h-11 items-center rounded-full bg-action px-5 font-bold text-ink">
                Find my circle
              </Link>
            </div>
          </nav>
        </details>
      </Container>
    </header>
  );
}
