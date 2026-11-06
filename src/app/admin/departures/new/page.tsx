import type { Metadata } from "next";
import { nowMs } from "@/lib/time";
import { requirePageRole } from "@/lib/auth/pages";
import { listHosts, listPolicyVersions, listTripsForAdmin } from "@/features/trips/service";
import { Notice } from "@/components/ui/notice";
import { DepartureForm } from "../departure-form";

export const metadata: Metadata = { title: "New departure", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewDeparturePage() {
  const { allowed } = await requirePageRole("/admin/departures/new", "operator");
  if (!allowed) return <Notice tone="error" title="Operator role required" />;
  const [trips, hosts, policies] = await Promise.all([listTripsForAdmin(), listHosts(), listPolicyVersions()]);
  const start = new Date(nowMs() + 45 * 86_400_000);
  const toDate = (d: Date) => d.toISOString().slice(0, 10);
  return (
    <>
      <h1 className="text-title">New departure</h1>
      <p className="mt-2 text-ink-2">Created as a draft. Publish from the departure page once trip content, host, pricing and policy are approved.</p>
      {trips.length === 0 ? <div className="mt-4"><Notice tone="attention" title="No trips yet">Run the seed or create a trip first.</Notice></div> : null}
      <div className="mt-8">
        <DepartureForm
          mode="create"
          trips={trips.map((t) => ({ id: t.id, label: `${t.title} (${t.destination})` }))}
          hosts={hosts.map((h) => ({ id: h.id, label: h.name }))}
          policies={policies.map((p) => ({ id: p.id, label: `${p.name} v${p.version}${p.isPilotFixture ? " (fixture)" : ""}` }))}
          initial={{
            tripId: trips[0]?.id ?? "",
            hostId: hosts[0]?.id ?? "",
            policyVersionId: policies[0]?.id ?? "",
            startDate: toDate(start),
            endDate: toDate(new Date(start.getTime() + 2 * 86_400_000)),
            salesCloseAt: new Date(start.getTime() - 5 * 86_400_000).toISOString().slice(0, 16),
            capacity: 12,
            minAge: 25,
            maxAge: 40,
            totalPaise: 1_200_000,
            depositBps: 3000,
            holdMinutes: 15,
            reviewHours: 48,
            balanceWindowHours: 24,
            taxesNote: "Prices are tax-inclusive.",
            tags: [],
          }}
        />
      </div>
    </>
  );
}
