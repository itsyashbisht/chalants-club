import "@/lib/server-guard";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbOrTx } from "@/lib/db/client";
import { withClockTx } from "@/lib/db/tx";
import { errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { users } from "@/lib/db/core-schema";
import { bookings } from "@/features/bookings/schema";
import { departures, hosts, trips, hostAssignments } from "@/features/trips/schema";
import { optionLabel } from "@/features/quiz/questions";
import { circlePreferences, circleTracks, reconnectChoices } from "./schema";

const CIRCLE_STATES = ["CONFIRMED", "COMPLETED"] as const;

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] || "A traveller";
}

/** The private circle for a confirmed traveller: host, logistics, shared intros, playlist and reconnect state. */
export async function getCircle(bookingId: string, userId: string, db: DbOrTx = getDb()) {
  const [row] = await db
    .select({ booking: bookings, departure: departures, trip: trips, host: hosts })
    .from(bookings)
    .innerJoin(departures, eq(bookings.departureId, departures.id))
    .innerJoin(trips, eq(departures.tripId, trips.id))
    .innerJoin(hosts, eq(departures.hostId, hosts.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row || row.booking.ownerId !== userId) throw errors.notFound("Booking not found.");
  if (!CIRCLE_STATES.includes(row.booking.state as (typeof CIRCLE_STATES)[number])) throw errors.forbidden("The circle opens once your seat is confirmed.");

  const members = await db
    .select({ pref: circlePreferences, user: { id: users.id, name: users.name }, bookingState: bookings.state })
    .from(circlePreferences)
    .innerJoin(users, eq(circlePreferences.userId, users.id))
    .innerJoin(bookings, eq(circlePreferences.bookingId, bookings.id))
    .where(and(eq(circlePreferences.departureId, row.departure.id), inArray(bookings.state, [...CIRCLE_STATES])))
    .orderBy(asc(circlePreferences.createdAt));

  const tracks = await db
    .select({ title: circleTracks.title, artist: circleTracks.artist, approved: circleTracks.approved, userId: circleTracks.userId })
    .from(circleTracks)
    .where(eq(circleTracks.departureId, row.departure.id))
    .orderBy(asc(circleTracks.createdAt));

  const mine = members.find((m) => m.user.id === userId)?.pref ?? null;
  const completed = row.departure.status === "completed";
  const myChoices = completed
    ? await db.select({ toUserId: reconnectChoices.toUserId }).from(reconnectChoices).where(and(eq(reconnectChoices.departureId, row.departure.id), eq(reconnectChoices.fromUserId, userId)))
    : [];
  const mutual = completed ? await mutualReconnects(row.departure.id, userId, db) : [];

  return {
    booking: row.booking,
    departure: row.departure,
    trip: row.trip,
    host: { name: row.host.name, bio: row.host.bio, photoUrl: row.host.photoUrl },
    members: members.map((m) => ({
      userId: m.user.id,
      firstName: firstName(m.user.name),
      intro: m.pref.intro,
      welcomePreference: m.pref.shareWelcomePreference && m.pref.welcomePreferenceOptionId ? optionLabel("q2", m.pref.welcomePreferenceOptionId) : null,
      isMe: m.user.id === userId,
      attended: m.pref.attended,
    })),
    tracks: tracks.filter((t) => t.approved || t.userId === userId).map((t) => ({ title: t.title, artist: t.artist, approved: t.approved, mine: t.userId === userId })),
    myPreferences: mine,
    reconnect: {
      enabled: completed && Boolean(mine?.attended) && !mine?.contactShareRevokedAt,
      chosen: myChoices.map((c) => c.toUserId),
      mutual,
    },
  };
}

export const preferencesSchema = z.object({
  shareWelcomePreference: z.boolean(),
  welcomePreferenceOptionId: z.string().max(60).nullable().optional(),
  shareRotationPreference: z.boolean(),
  rotationPreferenceOptionId: z.string().max(60).nullable().optional(),
  intro: z.string().trim().max(280).nullable().optional(),
  revokeContactShare: z.boolean().optional(),
});

export async function updatePreferences(bookingId: string, userId: string, input: z.infer<typeof preferencesSchema>) {
  return withClockTx(async (tx, now) => {
    const [pref] = await tx.select().from(circlePreferences).where(and(eq(circlePreferences.bookingId, bookingId), eq(circlePreferences.userId, userId))).for("update");
    if (!pref) throw errors.notFound("Circle not found.");
    const [updated] = await tx
      .update(circlePreferences)
      .set({
        shareWelcomePreference: input.shareWelcomePreference,
        welcomePreferenceOptionId: input.welcomePreferenceOptionId ?? null,
        shareRotationPreference: input.shareRotationPreference,
        rotationPreferenceOptionId: input.rotationPreferenceOptionId ?? null,
        intro: input.intro ?? null,
        contactShareRevokedAt: input.revokeContactShare ? (pref.contactShareRevokedAt ?? now) : pref.contactShareRevokedAt,
        updatedAt: now,
      })
      .where(eq(circlePreferences.id, pref.id))
      .returning();
    return updated;
  });
}

export const trackSchema = z.object({ title: z.string().trim().min(1).max(120), artist: z.string().trim().min(1).max(120), consent: z.literal(true) });

/** Suggests a track for the playlist. Requires explicit consent; the host approves before it appears to others. */
export async function submitTrack(bookingId: string, userId: string, input: z.infer<typeof trackSchema>) {
  return withClockTx(async (tx, now) => {
    const [pref] = await tx.select().from(circlePreferences).where(and(eq(circlePreferences.bookingId, bookingId), eq(circlePreferences.userId, userId))).limit(1);
    if (!pref) throw errors.notFound("Circle not found.");
    const [row] = await tx
      .insert(circleTracks)
      .values({ departureId: pref.departureId, bookingId, userId, title: input.title, artist: input.artist, consentAt: now, createdAt: now })
      .onConflictDoUpdate({ target: circleTracks.bookingId, set: { title: input.title, artist: input.artist, consentAt: now, approved: false } })
      .returning();
    return row;
  });
}

/**
 * Private mutual reconnect after a completed trip. Contact is revealed only when both confirmed, recorded attendees
 * choose each other and neither has revoked sharing. Self-selection and non-members are rejected.
 */
export async function chooseReconnect(departureId: string, userId: string, toUserId: string) {
  if (userId === toUserId) throw errors.invalid("You cannot select yourself.");
  return withClockTx(async (tx, now) => {
    const [departure] = await tx.select().from(departures).where(eq(departures.id, departureId)).limit(1);
    if (!departure || departure.status !== "completed") throw errors.conflict("NOT_COMPLETED", "Reconnect opens after the trip is completed.");
    const prefs = await tx
      .select({ pref: circlePreferences, state: bookings.state })
      .from(circlePreferences)
      .innerJoin(bookings, eq(circlePreferences.bookingId, bookings.id))
      .where(and(eq(circlePreferences.departureId, departureId), inArray(circlePreferences.userId, [userId, toUserId]), inArray(bookings.state, [...CIRCLE_STATES])));
    const me = prefs.find((p) => p.pref.userId === userId);
    const them = prefs.find((p) => p.pref.userId === toUserId);
    if (!me || !me.pref.attended || me.pref.contactShareRevokedAt) throw errors.forbidden("Reconnect is available to recorded attendees who have not opted out.");
    if (!them) throw errors.notFound("That traveller is not part of this circle.");
    await tx.insert(reconnectChoices).values({ departureId, fromUserId: userId, toUserId, createdAt: now }).onConflictDoNothing();
    await audit(tx, { actorType: "user", actorUserId: userId, operation: "circle.reconnect_chosen", entityType: "departure", entityId: departureId });
    const [reverse] = await tx
      .select({ id: reconnectChoices.id })
      .from(reconnectChoices)
      .where(and(eq(reconnectChoices.departureId, departureId), eq(reconnectChoices.fromUserId, toUserId), eq(reconnectChoices.toUserId, userId)))
      .limit(1);
    const mutual = Boolean(reverse) && Boolean(them.pref.attended) && !them.pref.contactShareRevokedAt;
    return { mutual };
  });
}

async function mutualReconnects(departureId: string, userId: string, db: DbOrTx) {
  const mine = await db.select({ toUserId: reconnectChoices.toUserId }).from(reconnectChoices).where(and(eq(reconnectChoices.departureId, departureId), eq(reconnectChoices.fromUserId, userId)));
  if (mine.length === 0) return [];
  const theirs = await db
    .select({ fromUserId: reconnectChoices.fromUserId })
    .from(reconnectChoices)
    .where(and(eq(reconnectChoices.departureId, departureId), eq(reconnectChoices.toUserId, userId), inArray(reconnectChoices.fromUserId, mine.map((m) => m.toUserId))));
  if (theirs.length === 0) return [];
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, revoked: circlePreferences.contactShareRevokedAt, attended: circlePreferences.attended })
    .from(circlePreferences)
    .innerJoin(users, eq(circlePreferences.userId, users.id))
    .where(and(eq(circlePreferences.departureId, departureId), inArray(circlePreferences.userId, theirs.map((t) => t.fromUserId)), isNull(circlePreferences.contactShareRevokedAt), eq(circlePreferences.attended, true)));
  return rows.map((r) => ({ userId: r.id, name: r.name ?? "Traveller", email: r.email }));
}

/** Host view: confirmed attendees on an assigned departure with only the preferences they chose to share. */
export async function hostRoster(departureId: string, hostUserId: string, db: DbOrTx = getDb()) {
  const [assignment] = await db.select().from(hostAssignments).where(and(eq(hostAssignments.departureId, departureId), eq(hostAssignments.userId, hostUserId))).limit(1);
  if (!assignment) throw errors.forbidden("You are not assigned to this departure.");
  const rows = await db
    .select({ pref: circlePreferences, user: { name: users.name }, booking: { id: bookings.id, reference: bookings.reference, state: bookings.state }, trackId: circleTracks.id })
    .from(circlePreferences)
    .innerJoin(users, eq(circlePreferences.userId, users.id))
    .innerJoin(bookings, eq(circlePreferences.bookingId, bookings.id))
    .leftJoin(circleTracks, eq(circleTracks.bookingId, bookings.id))
    .where(and(eq(circlePreferences.departureId, departureId), inArray(bookings.state, [...CIRCLE_STATES])))
    .orderBy(asc(circlePreferences.createdAt));
  return rows.map((r) => ({
    name: r.user.name ?? "Traveller",
    reference: r.booking.reference,
    bookingId: r.booking.id,
    trackId: r.trackId,
    attended: r.pref.attended,
    welcomePreference: r.pref.shareWelcomePreference && r.pref.welcomePreferenceOptionId ? optionLabel("q2", r.pref.welcomePreferenceOptionId) : null,
    rotationPreference: r.pref.shareRotationPreference && r.pref.rotationPreferenceOptionId ? optionLabel("q7", r.pref.rotationPreferenceOptionId) : null,
    prefId: r.pref.id,
  }));
}

export async function markAttendance(prefId: string, attended: boolean, actorUserId: string) {
  return withClockTx(async (tx, now) => {
    const [updated] = await tx.update(circlePreferences).set({ attended, updatedAt: now }).where(eq(circlePreferences.id, prefId)).returning();
    if (!updated) throw errors.notFound("Attendee not found.");
    await audit(tx, { actorType: "user", actorUserId, operation: "circle.attendance", entityType: "circle_preference", entityId: prefId, metadata: { attended } });
    return updated;
  });
}

export async function approveTrack(departureId: string, bookingId: string, approved: boolean, actorUserId: string) {
  return withClockTx(async (tx) => {
    const [updated] = await tx.update(circleTracks).set({ approved }).where(and(eq(circleTracks.departureId, departureId), eq(circleTracks.bookingId, bookingId))).returning();
    if (!updated) throw errors.notFound("Track not found.");
    await audit(tx, { actorType: "user", actorUserId, operation: "circle.track_approval", entityType: "circle_track", entityId: updated.id, metadata: { approved } });
    return updated;
  });
}
