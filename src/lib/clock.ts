/** Injectable clock. Booking transitions use database time; jobs and tests inject a clock. */
export type Clock = { now(): Date };

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(at: Date | string): Clock & { set(next: Date | string): void; advanceMinutes(m: number): void } {
  let current = new Date(at);
  return {
    now: () => new Date(current),
    set(next) {
      current = new Date(next);
    },
    advanceMinutes(m) {
      current = new Date(current.getTime() + m * 60_000);
    },
  };
}
