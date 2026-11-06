import "@/lib/server-guard";
import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  APP_URL: z.preprocess(emptyToUndefined, z.string().url().default("http://localhost:3000")),
  /** Optional at parse time so public pages can render on a bare deployment; getDb() fails loudly when it is missing. */
  DATABASE_URL: optionalString,
  OPERATOR_NAME: z.preprocess(emptyToUndefined, z.string().default("Chalants Club")),
  SUPPORT_EMAIL: z.preprocess(emptyToUndefined, z.string().email().default("support@example.com")),
  SUPPORT_HOURS: z.preprocess(emptyToUndefined, z.string().default("Mon-Sat, 10:00-18:00 IST")),

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalString,
  CLERK_SECRET_KEY: optionalString,
  BOOTSTRAP_OPERATOR_EMAILS: z.preprocess(emptyToUndefined, z.string().default("")),
  AUTH_DEV_BYPASS: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).default("false")),

  RAZORPAY_MODE: z.preprocess(emptyToUndefined, z.enum(["test", "live"]).default("test")),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  RAZORPAY_WEBHOOK_SECRET: optionalString,
  RAZORPAY_WEBHOOK_SECRET_PREVIOUS: optionalString,
  RAZORPAY_ACCOUNT_ID: optionalString,
  PAYMENTS_LIVE_ENABLED: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).default("false")),

  SCHEDULER_SECRET: optionalString,

  RESEND_API_KEY: optionalString,
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().default("Chalants Club <bookings@example.com>")),
  STAFF_ALERT_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

/** Parsed, validated server environment. Throws a descriptive error if required variables are missing. */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: clear the cache after mutating process.env. */
export function resetEnvCache() {
  cached = undefined;
}

export function isClerkConfigured(): boolean {
  const e = env();
  return Boolean(e.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && e.CLERK_SECRET_KEY);
}

export function isDevAuthBypassEnabled(): boolean {
  const e = env();
  return e.NODE_ENV !== "production" && e.AUTH_DEV_BYPASS === "true" && !isClerkConfigured();
}

export type PaymentsConfigStatus =
  | { ok: true; mode: "test" | "live"; keyId: string; keySecret: string; webhookSecret: string | undefined }
  | { ok: false; reason: "NOT_CONFIGURED" | "LIVE_DISABLED" | "KEY_MODE_MISMATCH" };

/** Razorpay credentials with the live-mode guard applied. Live keys are refused unless explicitly enabled. */
export function paymentsConfig(): PaymentsConfigStatus {
  const e = env();
  if (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET) return { ok: false, reason: "NOT_CONFIGURED" };
  const keyIsLive = e.RAZORPAY_KEY_ID.startsWith("rzp_live_");
  const keyIsTest = e.RAZORPAY_KEY_ID.startsWith("rzp_test_");
  if ((e.RAZORPAY_MODE === "live") !== keyIsLive || (e.RAZORPAY_MODE === "test") !== keyIsTest) {
    return { ok: false, reason: "KEY_MODE_MISMATCH" };
  }
  if (e.RAZORPAY_MODE === "live" && e.PAYMENTS_LIVE_ENABLED !== "true") {
    return { ok: false, reason: "LIVE_DISABLED" };
  }
  return {
    ok: true,
    mode: e.RAZORPAY_MODE,
    keyId: e.RAZORPAY_KEY_ID,
    keySecret: e.RAZORPAY_KEY_SECRET,
    webhookSecret: e.RAZORPAY_WEBHOOK_SECRET,
  };
}
