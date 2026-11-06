"use client";

/** Small JSON client for same-origin API calls. Throws ApiError with the server's stable code and message. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly correlationId?: string;
  readonly details?: unknown;
  readonly body: unknown;

  constructor(status: number, code: string, message: string, extra: { correlationId?: string; details?: unknown; body?: unknown } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.correlationId = extra.correlationId;
    this.details = extra.details;
    this.body = extra.body;
  }
}

export async function api<T>(path: string, init: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {}): Promise<{ status: number; data: T }> {
  const res = await fetch(path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    credentials: "same-origin",
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; correlationId?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `Request failed (${res.status})`, { correlationId: err?.correlationId, details: err?.details, body: data });
  }
  return { status: res.status, data: data as T };
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.correlationId ? `${error.message} (ref ${error.correlationId.slice(0, 8)})` : error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
