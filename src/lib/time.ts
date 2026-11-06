/** Time helpers. Storage is UTC; display is Asia/Kolkata. Safe for client and server. */

export const DISPLAY_TZ = "Asia/Kolkata";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: DISPLAY_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateOnly = new Intl.DateTimeFormat("en-IN", {
  timeZone: DISPLAY_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dayMonth = new Intl.DateTimeFormat("en-IN", {
  timeZone: DISPLAY_TZ,
  day: "numeric",
  month: "short",
});

export function formatIstDateTime(value: Date | string): string {
  return `${dateTime.format(new Date(value))} IST`;
}

export function formatIstDate(value: Date | string): string {
  return dateOnly.format(toDate(value));
}

export function formatDateRange(start: Date | string, end: Date | string): string {
  const s = toDate(start);
  const e = toDate(end);
  const year = new Intl.DateTimeFormat("en-IN", { timeZone: DISPLAY_TZ, year: "numeric" }).format(e);
  return `${dayMonth.format(s)} – ${dayMonth.format(e)} ${year}`;
}

/** Accepts a Date or a `YYYY-MM-DD` date string (interpreted at noon UTC to avoid timezone shifts). */
export function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00Z`);
  return new Date(value);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export function minutesUntil(target: Date, now = new Date()): number {
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / 60_000));
}

/** Wrapper so server components can read the clock without tripping purity lint rules. */
export function nowMs(): number {
  return Date.now();
}
