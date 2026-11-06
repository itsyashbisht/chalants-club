import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { requirePageRole } from "@/lib/auth/pages";
import { hasRole } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { getDepartureAdmin, listHosts, listPolicyVersions, listTripsForAdmin } from "@/features/trips/service";
import { hostRoster } from "@/features/circle/service";
import { circlePreferences, circleTracks } from "@/features/circle/schema";
import { formatDateRange, formatIstDateTime } from "@/lib/time";
import { formatInr } from "@/lib/money";
import { isAppError } from "@/lib/errors";
import { Notice } from "@/components/ui/notice";
import { Rule } from "@/components/ui/container";
import { DepartureForm } from "../departure-form";
import { DepartureActions, RosterControls } from "./departure-actions";

export const metadata: Metadata = { title: "Departure (admin)", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminDeparturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { user, allowed } = await requirePageRole(`/admin/departures/${id}`, "operator", "host");
  if (!allowed) return <Notice tone="error" title="Operator or host role required" />;
  const isOperator = hasRole(user, "operator");

  if (!isOperator) {
    let roster;
    try {
      roster = await hostRoster(id, user.id);
    } catch (error: unknown) {
      if (isAppError(error)) return <Notice tone="error" title={error.message} />;
      throw error;
    }
    const tracks = await getDb().select().from(circleTracks).where(eq(circleTracks.departureId, id));
    return (
      <>
        <h1 className="text-title">Arrival roster</h1>
        <p className="mt-2 text-ink-2">Confirmed attendees only, with the preferences they chose to share. Mark attendance on arrival; it enables post-trip reconnect for that traveller.</p>
        <ul className="mt-6 grid gap-3">
          {roster.map((r) => {
            const track = tracks.find((t) => t.id === r.trackId) ?? null;
            return (
              <li key={r.prefId} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-rule bg-surface p-4">
                <span>
                  <span className="font-semibold">{r.name}</span> · {r.reference}
                  {r.welcomePreference ? ` · first hello: ${r.welcomePreference}` : ""}
                  {r.rotationPreference ? ` · day two: ${r.rotationPreference}` : ""}
                  {track ? ` · track: ${track.title} – ${track.artist}` : ""}
                </span>
                <RosterControls departureId={id} prefId={r.prefId} attended={r.attended} bookingId={r.bookingId} hasTrack={Boolean(track)} trackApproved={Boolean(track?.approved)} />
              </li>
            );
          })}
          {roster.length === 0 ? <li className="text-ink-2">No confirmed travellers yet.</li> : null}
        </ul>
      </>
    );
  }

  const data = await getDepartureAdmin(id);
  if (!data) notFound();
  const [trips, hosts, policies] = await Promise.all([listTripsForAdmin(), listHosts(), listPolicyVersions()]);
  const confirmedIds = data.roster.filter((r) => r.booking.state === "CONFIRMED" || r.booking.state === "COMPLETED").map((r) => r.booking.id);
  const [prefs, tracks] = confirmedIds.length
    ? await Promise.all([
        getDb().select().from(circlePreferences).where(and(eq(circlePreferences.departureId, id), inArray(circlePreferences.bookingId, confirmedIds))),
        getDb().select().from(circleTracks).where(eq(circleTracks.departureId, id)),
      ])
    : [[], []];
  const d = data.departure;
  const localDateTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

  return (
    <>
      <p className="text-meta font-semibold uppercase tracking-wide text-ink-2">
        <Link href="/admin/departures" className="underline">
          Departures
        </Link>
      </p>
      <h1 className="text-title">
        {data.trip.title} · {formatDateRange(d.startDate, d.endDate)}
      </h1>
      <p className="mt-2 text-ink-2">
        {d.status} · version {d.version} · {data.allocated}/{d.capacity} seats allocated · {formatInr(d.totalPaise)} · host {data.host.name} · policy {data.policy.name} v{data.policy.version}
        {d.isPilotFixture ? " · pilot fixture" : ""}
      </p>
      <p className="mt-1 text-meta text-ink-2">
        Public preview:{" "}
        <Link href={`/trips/${data.trip.slug}?departure=${d.id}`} className="underline">
          /trips/{data.trip.slug}
        </Link>
      </p>

      <section className="mt-8 rounded-editorial border border-rule bg-surface p-6">
        <h2 className="text-xl">Status</h2>
        <div className="mt-3">
          <DepartureActions departureId={d.id} status={d.status} version={d.version} allocated={data.allocated} />
        </div>
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="rounded-editorial border border-rule bg-surface p-6">
          <h2 className="text-xl">Roster ({data.roster.length})</h2>
          <ul className="mt-3 grid gap-2 text-meta">
            {data.roster.map((r) => {
              const pref = prefs.find((p) => p.bookingId === r.booking.id) ?? null;
              const track = tracks.find((t) => t.bookingId === r.booking.id) ?? null;
              return (
                <li key={r.booking.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-rule py-2">
                  <span>
                    <Link href={`/admin/bookings/${r.booking.id}`} className="font-semibold underline">
                      {r.booking.reference}
                    </Link>{" "}
                    · {r.booking.state} · {r.traveller.name ?? r.traveller.email} · age {r.booking.travellerAge} · {formatIstDateTime(r.booking.createdAt)}
                    {track ? ` · track: ${track.title} – ${track.artist}` : ""}
                  </span>
                  <RosterControls departureId={d.id} prefId={pref?.id ?? null} attended={Boolean(pref?.attended)} bookingId={r.booking.id} hasTrack={Boolean(track)} trackApproved={Boolean(track?.approved)} />
                </li>
              );
            })}
            {data.roster.length === 0 ? <li className="text-ink-2">No bookings yet.</li> : null}
          </ul>
        </div>
        <div className="rounded-editorial border border-rule bg-surface p-6">
          <h2 className="text-xl">Waitlist ({data.waitlist.length})</h2>
          <ul className="mt-3 grid gap-1 text-meta text-ink-2">
            {data.waitlist.map((w) => (
              <li key={w.id}>
                {w.email}
                {w.name ? ` (${w.name})` : ""} · {formatIstDateTime(w.createdAt)}
              </li>
            ))}
            {data.waitlist.length === 0 ? <li>Nobody waiting.</li> : null}
          </ul>
          <p className="mt-3 text-meta text-ink-2">To invite someone, email them the public trip link; they book through the ordinary flow.</p>
        </div>
      </section>

      <Rule className="my-10" />
      <h2 className="text-xl">Edit</h2>
      <p className="mt-1 text-meta text-ink-2">Capacity cannot drop below allocated seats. Price changes are blocked once travellers hold seats; date, age and policy changes bump the quote version.</p>
      <div className="mt-6">
        <DepartureForm
          mode="edit"
          departureId={d.id}
          expectedVersion={d.version}
          trips={trips.map((t) => ({ id: t.id, label: `${t.title} (${t.destination})` }))}
          hosts={hosts.map((h) => ({ id: h.id, label: h.name }))}
          policies={policies.map((p) => ({ id: p.id, label: `${p.name} v${p.version}${p.isPilotFixture ? " (fixture)" : ""}` }))}
          initial={{
            tripId: d.tripId,
            hostId: d.hostId,
            policyVersionId: d.policyVersionId,
            startDate: d.startDate,
            endDate: d.endDate,
            salesCloseAt: localDateTime(d.salesCloseAt),
            capacity: d.capacity,
            minAge: d.minAge,
            maxAge: d.maxAge,
            totalPaise: d.totalPaise,
            depositBps: d.depositBps,
            holdMinutes: d.holdMinutes,
            reviewHours: d.reviewHours,
            balanceWindowHours: d.balanceWindowHours,
            taxesNote: d.taxesNote,
            tags: data.tags.map((t) => ({ question: t.question as "q3" | "q4" | "q5" | "q6", optionId: t.optionId, fact: t.fact })),
          }}
        />
      </div>
    </>
  );
}
