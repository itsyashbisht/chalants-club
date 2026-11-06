import type { Metadata } from "next";
import Link from "next/link";
import { requirePageRole } from "@/lib/auth/pages";
import { listReviewQueue } from "@/features/verification/service";
import { formatIstDateTime, formatIstDate, nowMs } from "@/lib/time";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Review queue", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const { allowed } = await requirePageRole("/admin/reviews", "reviewer", "operator");
  if (!allowed) return <Notice tone="error" title="Reviewer role required" />;
  const rows = await listReviewQueue();
  const now = nowMs();
  const open = rows.filter((r) => r.review.decision === "pending" || r.review.decision === "info_requested");
  const closed = rows.filter((r) => r.review.decision === "approved" || r.review.decision === "rejected");
  return (
    <>
      <h1 className="text-title">Review queue</h1>
      <p className="mt-2 text-ink-2">Private identity and age checks. Record only the outcome, time and your name. Never note document numbers.</p>
      <h2 className="mt-8 text-xl">Open ({open.length})</h2>
      {open.length === 0 ? (
        <p className="mt-2 text-ink-2">Nothing waiting.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-meta">
            <thead>
              <tr className="border-b border-rule text-ink-2">
                <th className="py-2 pr-3 font-semibold">Booking</th>
                <th className="py-2 pr-3 font-semibold">Traveller</th>
                <th className="py-2 pr-3 font-semibold">Trip</th>
                <th className="py-2 pr-3 font-semibold">Call</th>
                <th className="py-2 pr-3 font-semibold">SLA</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {open.map((r) => {
                const overdue = r.review.dueAt.getTime() < now;
                return (
                  <tr key={r.review.id} className="border-b border-rule">
                    <td className="py-2 pr-3">
                      <Link href={`/admin/bookings/${r.booking.id}`} className="font-semibold underline">
                        {r.booking.reference}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      {r.traveller.name ?? "—"} · age {r.booking.travellerAge}
                    </td>
                    <td className="py-2 pr-3">
                      {r.trip.title} · {formatIstDate(r.departure.startDate)}
                    </td>
                    <td className="py-2 pr-3">{r.review.callStatus}</td>
                    <td className={`py-2 pr-3 ${overdue ? "font-semibold text-error" : ""}`}>
                      {overdue ? "Overdue · " : "Due "}
                      {formatIstDateTime(r.review.dueAt)}
                      {r.review.escalatedAt ? " · escalated" : ""}
                    </td>
                    <td className="py-2">{r.review.decision}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <h2 className="mt-10 text-xl">Decided ({closed.length})</h2>
      <ul className="mt-3 grid gap-2 text-meta">
        {closed.slice(0, 50).map((r) => (
          <li key={r.review.id}>
            <Link href={`/admin/bookings/${r.booking.id}`} className="underline">
              {r.booking.reference}
            </Link>{" "}
            · {r.review.decision} · {r.review.decidedAt ? formatIstDateTime(r.review.decidedAt) : ""}
          </li>
        ))}
      </ul>
    </>
  );
}
