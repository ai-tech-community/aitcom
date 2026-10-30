import {
  LOOK_BACK_FALLBACK_DAYS,
  type AutoDraftLookBack,
  type AutoDraftSettings,
} from "./auto-draft";

export type SuggestWindow = { since: Date; until: Date };
export type CalendarPeriod = { key: string; dueAt: Date };
export const BIWEEKLY_EPOCH = Date.UTC(2024, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
type CalendarSettings = Pick<
  AutoDraftSettings,
  "cadence" | "monthDay" | "weekday"
>;

/** The UTC calendar period containing now, whether its chosen day is due yet or not. */
export function calendarPeriod(
  s: CalendarSettings,
  now: Date,
): CalendarPeriod | null {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  switch (s.cadence) {
    case "monthly":
      return {
        key: `month:${year}-${String(month + 1).padStart(2, "0")}`,
        dueAt: new Date(Date.UTC(year, month, s.monthDay)),
      };
    case "weekly": {
      const thursday = new Date(Date.UTC(year, month, now.getUTCDate()));
      thursday.setUTCDate(
        thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7),
      );
      const weekYear = thursday.getUTCFullYear();
      const week = Math.ceil(
        ((thursday.getTime() - Date.UTC(weekYear, 0, 1)) / DAY_MS + 1) / 7,
      );
      return {
        key: `week:${weekYear}-W${String(week).padStart(2, "0")}`,
        dueAt: new Date(thursday.getTime() + (s.weekday - 4) * DAY_MS),
      };
    }
    case "biweekly": {
      const block = Math.floor(
        (now.getTime() - BIWEEKLY_EPOCH) / (2 * WEEK_MS),
      );
      return {
        key: `fortnight:${block}`,
        dueAt: new Date(
          BIWEEKLY_EPOCH + block * 2 * WEEK_MS + (s.weekday - 1) * DAY_MS,
        ),
      };
    }
    case "after_event":
    case "on_demand":
      return null;
  }
}

/** A due period only counts when the schedule had already started by its due day. */
export function isPeriodDue(
  period: CalendarPeriod,
  now: Date,
  scheduleStartsAt: Date | null,
): boolean {
  return (
    scheduleStartsAt !== null &&
    scheduleStartsAt <= period.dueAt &&
    now >= period.dueAt
  );
}

/** Next due day at or after both now and the start of an enabled calendar schedule. */
export function nextDraftAt(
  s: CalendarSettings & Pick<AutoDraftSettings, "enabled">,
  now: Date,
  scheduleStartsAt: Date | null,
): Date | null {
  if (!s.enabled || !scheduleStartsAt) return null;
  const from = new Date(Math.max(now.getTime(), scheduleStartsAt.getTime()));
  const period = calendarPeriod(s, from);
  if (!period) return null;
  if (period.dueAt >= from) return period.dueAt;
  switch (s.cadence) {
    case "monthly":
      return new Date(
        Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, s.monthDay),
      );
    case "weekly":
      return new Date(period.dueAt.getTime() + WEEK_MS);
    case "biweekly":
      return new Date(period.dueAt.getTime() + 2 * WEEK_MS);
    case "after_event":
    case "on_demand":
      return null;
  }
}

export function lookBackWindow(
  lookBack: AutoDraftLookBack,
  lastPublishedAt: Date | null,
  now: Date,
): SuggestWindow {
  const days = lookBack === "days_7" ? 7 : LOOK_BACK_FALLBACK_DAYS;
  return {
    since:
      lookBack === "since_last_issue" && lastPublishedAt
        ? lastPublishedAt
        : new Date(now.getTime() - days * DAY_MS),
    until: now,
  };
}
