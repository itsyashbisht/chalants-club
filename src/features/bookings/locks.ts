import "@/lib/server-guard";
import { eq } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import { departures } from "@/features/trips/schema";
import { bookings } from "./schema";
import { instalments } from "@/features/payments/schema";
import { errors } from "@/lib/errors";

export type DepartureRow = typeof departures.$inferSelect;
export type BookingRow = typeof bookings.$inferSelect;
export type InstalmentRow = typeof instalments.$inferSelect;

/**
 * Lock order for every booking mutation: departure → booking → instalment → payment.
 * All services (member, admin, jobs, webhooks) go through these helpers so the order never varies.
 */
export async function lockDeparture(tx: Tx, departureId: string): Promise<DepartureRow> {
  const [row] = await tx.select().from(departures).where(eq(departures.id, departureId)).for("update");
  if (!row) throw errors.notFound("Departure not found.");
  return row;
}

export async function lockBooking(tx: Tx, bookingId: string): Promise<BookingRow> {
  const [row] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).for("update");
  if (!row) throw errors.notFound("Booking not found.");
  return row;
}

/** Locks the departure first, then the booking, and returns fresh copies of both. */
export async function lockBookingChain(tx: Tx, bookingId: string): Promise<{ departure: DepartureRow; booking: BookingRow }> {
  const [peek] = await tx.select({ departureId: bookings.departureId }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!peek) throw errors.notFound("Booking not found.");
  const departure = await lockDeparture(tx, peek.departureId);
  const booking = await lockBooking(tx, bookingId);
  return { departure, booking };
}

export async function lockInstalment(tx: Tx, instalmentId: string): Promise<InstalmentRow> {
  const [row] = await tx.select().from(instalments).where(eq(instalments.id, instalmentId)).for("update");
  if (!row) throw errors.notFound("Instalment not found.");
  return row;
}
