import Image from "next/image";
import Link from "next/link";
import { formatInr } from "@/lib/money";
import { formatDateRange } from "@/lib/time";

export type DepartureCardData = {
  id: string;
  startDate: string;
  endDate: string;
  seatsLeft: number;
  minAge: number;
  maxAge: number;
  totalPaise: number;
  trip: { slug: string; title: string; destination: string; region: string; durationDays: number; pace: string; heroImageUrl: string | null; heroImageAlt: string | null; isPilot: boolean };
};

/** Destination and real start date first, then duration, ages, pace, total per person and availability. */
export function DepartureCard({ d, reasons, hostName }: { d: DepartureCardData; reasons?: Array<{ preference: string; fact: string }>; hostName?: string }) {
  const full = d.seatsLeft <= 0;
  const href = `/trips/${d.trip.slug}?departure=${d.id}`;
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-card border border-rule bg-surface transition-shadow duration-150 hover:shadow-[0_8px_30px_-12px_rgba(23,61,50,0.25)]">
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-tint" aria-label={`${d.trip.destination}, ${formatDateRange(d.startDate, d.endDate)}`}>
        {d.trip.heroImageUrl ? (
          <Image src={d.trip.heroImageUrl} alt={d.trip.heroImageAlt ?? ""} fill sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" quality={85} className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex size-full items-end p-4">
            <span className="font-display text-3xl text-ink/70">{d.trip.destination}</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-ink/70 to-transparent p-4 text-white">
          <span className="font-display text-2xl font-bold leading-none">{d.trip.destination}</span>
          <span className="rounded-full bg-paper/95 px-3 py-1 text-meta font-semibold text-ink">{d.trip.durationDays} days</span>
        </div>
        {full ? <span className="absolute left-3 top-3 rounded-full bg-band px-3 py-1 text-meta font-semibold text-lime">Full · waitlist</span> : d.seatsLeft <= 3 ? <span className="absolute left-3 top-3 rounded-full bg-action px-3 py-1 text-meta font-semibold text-ink">{d.seatsLeft} seat{d.seatsLeft === 1 ? "" : "s"} left</span> : null}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-meta font-semibold uppercase tracking-wide text-ink-2">{formatDateRange(d.startDate, d.endDate)}</p>
        <h3 className="mt-1 text-xl">
          <Link href={href} className="hover:underline">
            {d.trip.title}
          </Link>
        </h3>
        <p className="mt-2 text-meta text-ink-2">
          Ages {d.minAge}–{d.maxAge} · {d.trip.pace}
          {hostName ? ` · hosted by ${hostName}` : ""}
        </p>
        {reasons && reasons.length ? (
          <ul className="mt-4 space-y-2 border-t border-rule pt-4 text-meta">
            {reasons.map((r) => (
              <li key={r.fact}>
                <span className="font-semibold">You chose “{r.preference}”.</span> {r.fact}.
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <p>
            <span className="tabular text-2xl font-bold">{formatInr(d.totalPaise)}</span>
            <span className="block text-meta text-ink-2">per person, all taxes</span>
          </p>
          <span className={`text-meta font-semibold ${full ? "text-attention" : "text-success"}`}>{full ? "Join waitlist" : "Seats available"}</span>
        </div>
      </div>
    </article>
  );
}
