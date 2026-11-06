import { z } from "zod";
import { route, jsonPrivate } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { loadBookingForViewer, toStatusView } from "@/features/bookings/status";

export const runtime = "nodejs";

/** Owner-scoped, non-cacheable status used by the pending-payment poller and the account pages. */
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const bookingId = z.string().uuid().parse(id);
  const { detail, isOwner, isStaff } = await loadBookingForViewer(bookingId, user);
  const view = toStatusView(detail);
  return jsonPrivate({ ...view, viewer: { isOwner, isStaff } });
});
