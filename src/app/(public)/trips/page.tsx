import type { Metadata } from "next";
import Link from "next/link";
import { listDestinations, listOpenDepartures } from "@/features/trips/queries";
import { withDbFallback } from "@/lib/db/safe";
import { Container, Section, Eyebrow } from "@/components/ui/container";
import { DepartureCard } from "@/components/ui/departure-card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";

export const metadata: Metadata = { title: "Trips" };
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TripsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const destination = typeof params.destination === "string" && params.destination ? params.destination : undefined;
  const from = typeof params.from === "string" && DATE.test(params.from) ? params.from : undefined;
  const to = typeof params.to === "string" && DATE.test(params.to) ? params.to : undefined;
  const [departures, destinations] = await Promise.all([withDbFallback([], () => listOpenDepartures({ destination, from, to })), withDbFallback([], () => listDestinations())]);
  const filtered = Boolean(destination || from || to);
  return (
    <Section>
      <Container>
        <Eyebrow>Departures</Eyebrow>
        <h1 className="text-title">Trips</h1>
        <form method="get" className="mt-8 grid gap-4 rounded-control border border-rule bg-surface p-5 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end" aria-label="Filter departures">
          <div>
            <Label htmlFor="destination">Destination</Label>
            <Select id="destination" name="destination" defaultValue={destination ?? ""}>
              <option value="">All destinations</option>
              {destinations.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="from">From</Label>
            <Input id="from" name="from" type="date" defaultValue={from ?? ""} />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="date" defaultValue={to ?? ""} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">
              Filter
            </Button>
            {filtered ? (
              <Link href="/trips" className="inline-flex min-h-11 items-center px-3 font-semibold underline">
                Clear
              </Link>
            ) : null}
          </div>
        </form>
        {departures.length ? (
          <ul className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {departures.map((d) => (
              <li key={d.id}>
                <DepartureCard d={d} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-10 rounded-control border border-rule bg-surface p-8 text-center">
            <p className="text-lg font-semibold">No departures match these filters.</p>
            <p className="mt-2 text-ink-2">
              {filtered ? (
                <>
                  <Link href="/trips" className="underline">Clear the filters</Link> to see every open departure.
                </>
              ) : (
                "Nothing is published right now. Check back soon or take the quiz to be first in line."
              )}
            </p>
          </div>
        )}
      </Container>
    </Section>
  );
}
