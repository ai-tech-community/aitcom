export const SCHEDULE_MAX_DAYS = 365;
export type ScheduleProblem = "SCHEDULE_IN_PAST" | "SCHEDULE_TOO_FAR";

/** In the past (publishAt <= now) or more than SCHEDULE_MAX_DAYS ahead; null when fine. */
export function scheduleProblem(
  publishAt: Date,
  now: Date,
): ScheduleProblem | null {
  const ahead = publishAt.getTime() - now.getTime();
  if (ahead <= 0) return "SCHEDULE_IN_PAST";
  if (ahead > SCHEDULE_MAX_DAYS * 24 * 60 * 60 * 1000)
    return "SCHEDULE_TOO_FAR";
  return null;
}

/** A datetime-local value, read in the runtime's local time, as an ISO instant. */
export function localDateTimeToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  // Reject invalid dates and dates that JavaScript silently rolls forward.
  if (
    Number.isNaN(date.getTime()) ||
    isoToLocalDateTime(date.toISOString()) !== value
  ) {
    return null;
  }
  return date.toISOString();
}

/** An ISO instant as local YYYY-MM-DDTHH:mm, for prefilling the input. */
export function isoToLocalDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
