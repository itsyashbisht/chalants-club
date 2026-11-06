import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDb } from "../src/lib/db/client";
import { users, userRoles } from "../src/lib/db/core-schema";
import { departures, departureTags, hosts, itineraryDays, policyVersions, trips, hostAssignments } from "../src/features/trips/schema";
import { PILOT_POLICY_RULES } from "../src/features/bookings/policy";
import { TRIP_IMAGES, HOST_PHOTOS } from "../src/content/site";

/**
 * Deterministic staging/dev seed. Every record is a visibly marked pilot fixture. Includes a one-seat departure
 * for concurrency testing. Safe to re-run: trips are matched by slug and departures by (trip, start date).
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const { db, pool } = createDb(url, 2);
  try {
    const now = new Date();
    const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);
    const dateStr = (d: Date) => d.toISOString().slice(0, 10);

    // Policy
    let [policy] = await db.select().from(policyVersions).where(eq(policyVersions.name, "pilot"));
    if (!policy) {
      [policy] = await db.insert(policyVersions).values({ name: "pilot", version: 1, rules: PILOT_POLICY_RULES, isPilotFixture: true }).returning();
    }

    // Hosts
    const hostDefs = [
      { name: "Asha Menon", bio: "Asha has hosted eleven small-group trips across Rajasthan and runs the arrival chai herself. She is the person who notices when someone is standing alone." },
      { name: "Rohan Bhatt", bio: "Rohan grew up in Manali, has guided mountain walks for eight years, and keeps a famously good bus playlist." },
    ];
    const hostRows = [];
    for (const h of hostDefs) {
      const photoUrl = HOST_PHOTOS[h.name]?.src ?? null;
      const [existing] = await db.select().from(hosts).where(eq(hosts.name, h.name));
      if (existing) {
        await db.update(hosts).set({ photoUrl, bio: h.bio }).where(eq(hosts.id, existing.id));
        hostRows.push({ ...existing, photoUrl });
      } else {
        hostRows.push((await db.insert(hosts).values({ ...h, photoUrl }).returning())[0]);
      }
    }

    // Trips
    const tripDefs = [
      {
        slug: "udaipur-lakes-long-weekend",
        title: "Udaipur lakes long weekend",
        destination: "Udaipur",
        region: "Rajasthan",
        summary: "Three days around Pichola and Fateh Sagar with a group of twelve solo travellers, a haveli rooftop and one very good street-food walk.",
        description:
          "A relaxed first trip for people who want company without a packed schedule. Mornings start late, there is one planned activity a day, and evenings are yours. We stay in a restored haveli in the old city with twin-share rooms.\n\nPilot fixture: dates, prices and photography are placeholders until the operator publishes real inventory.",
        heroImageUrl: null,
        heroImageAlt: "Placeholder: destination artwork for Udaipur (no trip has run yet)",
        heroImageCredit: "Destination imagery placeholder",
        durationDays: 3,
        meetingPointArea: "Old city, near Jagdish Temple (exact address shared after confirmation)",
        roomPlan: "Twin-share rooms, same-gender by default. A private room upgrade is an extra cost where available.",
        pace: "Relaxed · one planned activity a day",
        inclusions: ["2 nights in a restored haveli (twin-share)", "Daily breakfast", "Hosted street-food walk", "Sunset boat ride on Lake Pichola", "Host on the ground throughout"],
        extraCosts: ["Travel to and from Udaipur", "Lunches and dinners (we book tables together)", "Optional activities (cooking class ~₹1,500)"],
        optionalActivities: ["Cooking class at a family home", "Early-morning walk to the Ambrai Ghat viewpoint"],
        days: [
          { dayNumber: 1, title: "Arrive, settle in, chai on the rooftop", description: "Check-in from 2 pm. Low-key welcome: chai with two or three people at a time, then dinner together for anyone who wants it." },
          { dayNumber: 2, title: "Old city on foot, food trail, sunset on the lake", description: "Optional short walk to the Ambrai Ghat viewpoint at 7 am. Late breakfast. Afternoon street-food walk through the old city. Sunset boat ride, then an open evening on the rooftop." },
          { dayNumber: 3, title: "Slow morning, optional cooking class, goodbyes", description: "Breakfast, an optional cooking class, and departures from noon." },
        ],
        tags: [
          { question: "q3", optionId: "short_walk_viewpoint", fact: "Day 2 offers an optional 7 am walk to the Ambrai Ghat viewpoint" },
          { question: "q3", optionId: "sleep_in_breakfast", fact: "Breakfast runs late on both full days" },
          { question: "q4", optionId: "local_food_trail", fact: "Day 2 afternoon is a hosted street-food walk through the old city" },
          { question: "q4", optionId: "explore_old_town", fact: "Day 2 is spent on foot in the old city" },
          { question: "q4", optionId: "pottery_or_cooking", fact: "Day 3 has an optional cooking class at a family home" },
          { question: "q5", optionId: "stay_at_cafe", fact: "One planned activity a day leaves afternoons free" },
          { question: "q5", optionId: "group_vote", fact: "Evening plans are decided together on the rooftop" },
          { question: "q6", optionId: "quiet_balcony", fact: "Evenings end on the haveli rooftop with no fixed plan" },
          { question: "q6", optionId: "bonfire_stories", fact: "The rooftop has a fire pit on cool nights" },
        ],
        host: hostRows[0],
        departures: [
          { startOffset: 35, capacity: 12, totalPaise: 1_200_000, minAge: 25, maxAge: 38, note: "standard" },
          { startOffset: 63, capacity: 12, totalPaise: 1_250_000, minAge: 28, maxAge: 42, note: "standard" },
          { startOffset: 21, capacity: 1, totalPaise: 1_200_000, minAge: 24, maxAge: 40, note: "one-seat race fixture" },
        ],
      },
      {
        slug: "himalayan-village-week",
        title: "Himalayan village week",
        destination: "Tirthan Valley",
        region: "Himachal Pradesh",
        summary: "Six days in a riverside village: two proper hikes, one lazy day, home-cooked food and a bonfire most nights.",
        description:
          "For people who like a plan. Two guided day hikes, a riverside picnic, a village cooking evening and a free day. Shared cottages with twin rooms. Expect early starts on hike days and long evenings by the fire.\n\nPilot fixture: dates, prices and photography are placeholders until the operator publishes real inventory.",
        heroImageUrl: null,
        heroImageAlt: "Placeholder: destination artwork for Tirthan Valley (no trip has run yet)",
        heroImageCredit: "Destination imagery placeholder",
        durationDays: 6,
        meetingPointArea: "Aut bus stand, Kullu district (shared transfer to the village)",
        roomPlan: "Twin rooms in shared cottages, same-gender by default.",
        pace: "Active · two hike days, one rest day",
        inclusions: ["5 nights in riverside cottages (twin-share)", "All meals (home-cooked, vegetarian with egg options)", "Two guided hikes with a local guide", "Shared transfer from Aut", "Host on the ground throughout"],
        extraCosts: ["Travel to and from Aut", "Trout-fishing permit (optional, ~₹500)", "Personal gear rental"],
        optionalActivities: ["Trout fishing", "Village pottery morning"],
        days: [
          { dayNumber: 1, title: "Arrive in the valley", description: "Shared transfer from Aut. Settle in, team game after dinner for anyone who's up for it." },
          { dayNumber: 2, title: "Sunrise hike to the ridge", description: "5:30 am start for the ridge sunrise; a shorter riverside walk for those who prefer. Bonfire in the evening." },
          { dayNumber: 3, title: "Rest day", description: "Nothing planned. Cards, naps, a village walk or pottery." },
          { dayNumber: 4, title: "Waterfall trail", description: "Full-day scenic trail with a picnic. Karaoke night in the common room." },
          { dayNumber: 5, title: "Cook with the village", description: "A cooking evening with our hosts' family. Stories by the fire." },
          { dayNumber: 6, title: "Goodbyes", description: "Breakfast and transfer back to Aut." },
        ],
        tags: [
          { question: "q3", optionId: "do_the_hike", fact: "Day 2 is a 5:30 am sunrise hike to the ridge" },
          { question: "q3", optionId: "short_walk_viewpoint", fact: "Day 2 has a shorter riverside walk as an alternative to the ridge" },
          { question: "q4", optionId: "scenic_trail", fact: "Day 4 is a full-day waterfall trail with a picnic" },
          { question: "q4", optionId: "pottery_or_cooking", fact: "Day 5 is a cooking evening with the hosts' family" },
          { question: "q5", optionId: "stick_to_plan", fact: "Hike days run to a fixed schedule with a local guide" },
          { question: "q6", optionId: "bonfire_stories", fact: "Most evenings end at the bonfire" },
          { question: "q6", optionId: "karaoke", fact: "Day 4 is karaoke night in the common room" },
          { question: "q6", optionId: "cards", fact: "The rest day is cards and naps" },
        ],
        host: hostRows[1],
        departures: [
          { startOffset: 49, capacity: 10, totalPaise: 2_850_000, minAge: 25, maxAge: 40, note: "standard" },
          { startOffset: 91, capacity: 10, totalPaise: 2_950_000, minAge: 30, maxAge: 45, note: "standard" },
        ],
      },
    ];

    for (const t of tripDefs) {
      const { days, tags, host, departures: deps, ...fields } = t;
      const images = TRIP_IMAGES[fields.slug];
      const imageFields = images
        ? { heroImageUrl: images.hero.src, heroImageAlt: images.hero.alt, heroImageCredit: `Photo: ${images.hero.credit} (licensed stock; replace with trip photography)`, galleryUrls: images.gallery }
        : {};
      let [trip] = await db.select().from(trips).where(eq(trips.slug, fields.slug));
      if (!trip) {
        [trip] = await db.insert(trips).values({ ...fields, ...imageFields, isPilot: true }).returning();
        await db.insert(itineraryDays).values(days.map((d) => ({ ...d, tripId: trip.id })));
      } else if (images) {
        await db.update(trips).set(imageFields).where(eq(trips.id, trip.id));
      }
      const existingDeps = await db.select().from(departures).where(eq(departures.tripId, trip.id));
      for (const d of deps) {
        const start = inDays(d.startOffset);
        const startDate = dateStr(start);
        if (existingDeps.some((e) => e.startDate === startDate)) continue;
        const end = new Date(start.getTime() + (t.durationDays - 1) * 86_400_000);
        const [dep] = await db
          .insert(departures)
          .values({
            tripId: trip.id,
            hostId: host.id,
            policyVersionId: policy.id,
            status: "published",
            startDate,
            endDate: dateStr(end),
            salesCloseAt: new Date(start.getTime() - 5 * 86_400_000),
            capacity: d.capacity,
            minAge: d.minAge,
            maxAge: d.maxAge,
            totalPaise: d.totalPaise,
            depositBps: 3_000,
            isPilotFixture: true,
          })
          .returning();
        await db.insert(departureTags).values(tags.map((tag) => ({ ...tag, departureId: dep.id })));
        console.log(`departure ${trip.slug} ${startDate} (${d.note}) → ${dep.id}`);
      }
    }

    // Staff users for local testing (dev auth bypass identifies users by email).
    const staff = [
      { email: "operator@example.test", name: "Ops Operator", roles: ["operator", "finance", "reviewer"] as const },
      { email: "reviewer@example.test", name: "Riya Reviewer", roles: ["reviewer"] as const },
      { email: "finance@example.test", name: "Farhan Finance", roles: ["finance"] as const },
      { email: "host@example.test", name: "Asha Menon", roles: ["host"] as const },
    ];
    for (const s of staff) {
      let [user] = await db.select().from(users).where(eq(users.email, s.email));
      if (!user) [user] = await db.insert(users).values({ clerkUserId: `dev:${s.email}`, email: s.email, name: s.name, mfaEnabled: true }).returning();
      for (const role of s.roles) await db.insert(userRoles).values({ userId: user.id, role }).onConflictDoNothing();
      if ((s.roles as readonly string[]).includes("host")) {
        const udaipur = await db.select().from(departures).innerJoin(trips, eq(departures.tripId, trips.id)).where(eq(trips.slug, "udaipur-lakes-long-weekend"));
        for (const row of udaipur) await db.insert(hostAssignments).values({ userId: user.id, departureId: row.departures.id }).onConflictDoNothing();
        await db.update(hosts).set({ userId: user.id }).where(eq(hosts.id, hostRows[0].id));
      }
    }
    console.log("seed complete (pilot fixtures)");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
