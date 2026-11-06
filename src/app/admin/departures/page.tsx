import type { Metadata } from "next";
import Link from "next/link";
import { requirePageRole } from "@/lib/auth/pages";
import { hasRole } from "@/lib/auth/server";
import { hostDepartures, listDeparturesForAdmin } from "@/features/trips/service";
import { formatDateRange, formatIstDateTime } from "@/lib/time";
import { formatInr } from "@/lib/money";
import { Notice } from "@/components/ui/notice";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Departures (admin)", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminDeparturesPage() {
  const { user, allowed } = await requirePageRole("/admin/departures", "operator", "host");
  if (!allowed) return <Notice tone="error" title="Operator or host role required" />;
  if (!hasRole(user, "operator")) {
    const mine = await hostDepartures(user.id);
    return (
      <>
        <h1 className="text-title">My departures</h1>
        <ul className="mt-6 grid gap-3">
          {mine.map(({ departure, trip }) => (
            <li key={departure.id} className="rounded-control border border-rule bg-surface p-4">
              <Link href={`/admin/departures/${departure.id}`} className="font-semibold underline">
                {trip.title} · {formatDateRange(departure.startDate, departure.endDate)}
              </Link>{" "}
              <span className="text-meta text-ink-2">· {departure.status}</span>
            </li>
          ))}
          {mine.length === 0 ? <li className="text-ink-2">No assigned departures.</li> : null}
        </ul>
      </>
    );
  }
  const rows = await listDeparturesForAdmin();
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-title">Departures</h1>
        <ButtonLink href="/admin/departures/new">New departure</ButtonLink>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-meta">
          <thead>
            <tr className="border-b border-rule text-ink-2">
              <th className="py-2 pr-3 font-semibold">Trip</th>
              <th className="py-2 pr-3 font-semibold">Dates</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 pr-3 font-semibold">Capacity</th>
              <th className="py-2 pr-3 font-semibold">Price</th>
              <th className="py-2 font-semibold">Sales close</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ departure, trip, host }) => (
              <tr key={departure.id} className="border-b border-rule">
                <td className="py-2 pr-3">
                  <Link href={`/admin/departures/${departure.id}`} className="font-semibold underline">
                    {trip.title}
                  </Link>
                  <span className="block text-ink-2">
                    {trip.destination} · host {host.name}
                    {departure.isPilotFixture ? " · fixture" : ""}
                  </span>
                </td>
                <td className="py-2 pr-3">{formatDateRange(departure.startDate, departure.endDate)}</td>
                <td className="py-2 pr-3">{departure.status}</td>
                <td className="py-2 pr-3">
                  {departure.capacity} · ages {departure.minAge}–{departure.maxAge}
                </td>
                <td className="tabular py-2 pr-3">{formatInr(departure.totalPaise)}</td>
                <td className="py-2">{formatIstDateTime(departure.salesCloseAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
