import Link from "next/link";
import { Container } from "./container";

export function SiteFooter() {
  const operator = process.env.OPERATOR_NAME || "Chalants Club";
  const supportEmail = process.env.SUPPORT_EMAIL || "support@example.com";
  const hours = process.env.SUPPORT_HOURS || "Mon-Sat, 10:00-18:00 IST";
  const year = new Date().getFullYear();
  return (
    <footer className="on-dark mt-0 bg-ink">
      <Container className="grid gap-10 py-14 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="font-display text-2xl font-bold">{operator}</p>
          <p className="prose-measure mt-3 text-ink-2">Hosted group trips for solo adults in India. Small groups, named hosts, every traveller verified by a person. Pilot programme: fixtures are marked as such until real trips are published.</p>
          <p className="mt-5 text-meta text-ink-2">
            Support: <a href={`mailto:${supportEmail}`} className="underline">{supportEmail}</a> · {hours}
          </p>
        </div>
        <nav aria-label="Trips" className="md:col-span-2">
          <p className="text-meta font-semibold uppercase tracking-wide text-ink-2">Trips</p>
          <ul className="mt-3 space-y-2">
            <li>
              <Link href="/trips" className="hover:underline">
                All departures
              </Link>
            </li>
            <li>
              <Link href="/quiz" className="hover:underline">
                Find my circle
              </Link>
            </li>
            <li>
              <Link href="/how-it-works" className="hover:underline">
                How it works
              </Link>
            </li>
            <li>
              <Link href="/safety" className="hover:underline">
                Safety
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Company" className="md:col-span-2">
          <p className="text-meta font-semibold uppercase tracking-wide text-ink-2">Company</p>
          <ul className="mt-3 space-y-2">
            <li>
              <Link href="/about" className="hover:underline">
                About and hosts
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:underline">
                Contact
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:underline">
                Private reporting
              </Link>
            </li>
            <li>
              <Link href="/account/bookings" className="hover:underline">
                My bookings
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Legal" className="md:col-span-3">
          <p className="text-meta font-semibold uppercase tracking-wide text-ink-2">Legal</p>
          <ul className="mt-3 space-y-2">
            <li>
              <Link href="/terms" className="hover:underline">
                Terms of booking
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:underline">
                Privacy and data retention
              </Link>
            </li>
            <li>
              <Link href="/cancellations" className="hover:underline">
                Cancellations and refunds
              </Link>
            </li>
          </ul>
          <p className="mt-5 text-meta text-ink-2">Payments by Razorpay. Prices in INR, all taxes included. Photography on this site is licensed stock until trip photography is published.</p>
        </nav>
      </Container>
      <div className="border-t border-paper/15">
        <Container className="flex flex-wrap items-center justify-between gap-2 py-4 text-meta text-ink-2">
          <span>
            © {year} {operator}
          </span>
          <span>Solo travellers only · Groups of 10–12 · Verified by a person</span>
        </Container>
      </div>
    </footer>
  );
}
