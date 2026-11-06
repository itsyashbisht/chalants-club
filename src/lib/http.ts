import "@/lib/server-guard";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { AppError, errors, isAppError } from "./errors";
import { log } from "./logger";
import { newId } from "./ids";
import { env } from "./env";

export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" } as const;

export function jsonPrivate<T>(data: T, init: { status?: number } = {}): NextResponse {
  return NextResponse.json(data, { status: init.status ?? 200, headers: PRIVATE_HEADERS });
}

export function jsonError(error: AppError, correlationId: string): NextResponse {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, correlationId, details: error.details ?? undefined } },
    { status: error.status, headers: PRIVATE_HEADERS },
  );
}

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response>;

/** Wraps a route handler: maps AppError to a stable JSON shape, logs unknown errors with a correlation ID. */
export function route<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    const correlationId = newId();
    try {
      return await handler(req, ctx);
    } catch (error: unknown) {
      if (isAppError(error)) {
        if (error.status >= 500) log.error("route.error", { correlationId, code: error.code, error });
        return jsonError(error, correlationId);
      }
      log.error("route.unhandled", { correlationId, error });
      return jsonError(new AppError("INTERNAL", 500, "Something went wrong. Quote this reference to support."), correlationId);
    }
  };
}

const MAX_BODY_BYTES = 64 * 1024;

/** Reads and validates a bounded JSON body. */
export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) throw errors.invalid("Request body too large.");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw errors.invalid("Request body too large.");
  let raw: unknown;
  try {
    raw = text.length ? JSON.parse(text) : {};
  } catch {
    throw errors.invalid("Body must be JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw errors.invalid(
      "Please check the highlighted fields.",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data;
}

/** CSRF guard for cookie-authenticated mutations: the request must originate from this app. */
export function requireSameOrigin(req: Request) {
  const appOrigin = new URL(env().APP_URL).origin;
  const origin = req.headers.get("origin");
  const fetchSite = req.headers.get("sec-fetch-site");
  if (origin) {
    if (origin === appOrigin) return;
    // Allow localhost dev origins that differ only by host name resolution.
    const o = new URL(origin);
    const a = new URL(appOrigin);
    if (o.port === a.port && ["localhost", "127.0.0.1"].includes(o.hostname) && ["localhost", "127.0.0.1"].includes(a.hostname)) return;
    throw errors.forbidden("Cross-origin request rejected.");
  }
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw errors.forbidden("Cross-site request rejected.");
  }
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
