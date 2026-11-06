import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST ?? "postgres://postgres:postgres@localhost:5433/chalants_test";
process.env.DATABASE_URL = TEST_DATABASE_URL;
Object.assign(process.env, { NODE_ENV: "test" });
process.env.APP_URL = process.env.APP_URL ?? "http://localhost:3000";
process.env.SCHEDULER_SECRET = process.env.SCHEDULER_SECRET ?? "test-scheduler-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS = "previous_webhook_secret";
process.env.RAZORPAY_MODE = "test";
process.env.RAZORPAY_KEY_ID = "rzp_test_fake";
process.env.RAZORPAY_KEY_SECRET = "fake_key_secret";
process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_test_fake";
process.env.AUTH_DEV_BYPASS = "false";
process.env.STAFF_ALERT_EMAIL = "ops@example.test";
delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
delete process.env.CLERK_SECRET_KEY;
delete process.env.RESEND_API_KEY;

import { getDb, closeDb } from "@/lib/db/client";
import { resetEnvCache } from "@/lib/env";

resetEnvCache();

export const db = getDb();

const TABLES = [
  "reconnect_choices",
  "circle_tracks",
  "circle_preferences",
  "support_cases",
  "outbox",
  "webhook_inbox",
  "refunds",
  "allocations",
  "payment_attempts",
  "gateway_orders",
  "instalments",
  "review_actions",
  "reviews",
  "cancellations",
  "cancel_quotes",
  "bookings",
  "quiz_submissions",
  "waitlist",
  "host_assignments",
  "departure_tags",
  "departures",
  "itinerary_days",
  "trips",
  "hosts",
  "policy_versions",
  "email_deliveries",
  "idempotency_keys",
  "job_leases",
  "rate_limits",
  "audit_log",
  "user_roles",
  "users",
];

export async function truncateAll() {
  await db.execute(sql.raw(`truncate table ${TABLES.map((t) => `"${t}"`).join(", ")} restart identity cascade`));
}

export { closeDb };
