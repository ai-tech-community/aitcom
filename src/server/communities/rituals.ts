/** Pure ritual scheduling logic. No DB, no clock — `now` is always injected. */

export type RitualMode = "auto" | "review";
export type RitualStatus = "active" | "paused";

export type RitualSchedule = {
  /** 0=Sunday .. 6=Saturday (UTC). */
  weekday: number;
  status: RitualStatus;
  /** "YYYY-MM-DD" of the last fire, or null if never fired. */
  lastFiredOn: string | null;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** UTC calendar-date key "YYYY-MM-DD" for an instant. */
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** UTC weekday (0=Sun..6=Sat). */
export function weekdayOf(d: Date): number {
  return d.getUTCDay();
}

/** Short weekday label, e.g. 1 -> "Mon". */
export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[((weekday % 7) + 7) % 7]!;
}

/** True if this ritual should fire on `now`'s date. */
export function isRitualDue(r: RitualSchedule, now: Date): boolean {
  if (r.status !== "active") return false;
  if (weekdayOf(now) !== r.weekday) return false;
  return r.lastFiredOn !== dateKey(now);
}

/** The soonest date (>= `from`'s date) whose weekday matches, as "YYYY-MM-DD". */
export function nextFireDate(weekday: number, from: Date): string {
  const delta = (((weekday - weekdayOf(from)) % 7) + 7) % 7;
  const d = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate() + delta,
    ),
  );
  return dateKey(d);
}
