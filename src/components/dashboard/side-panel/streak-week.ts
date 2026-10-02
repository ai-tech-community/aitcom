import {
  didUseFreezeOnDate,
  getWeekDates,
  wasDateActive,
  type StreakPeriod,
} from "@/components/ui/streak-calendar";

export type StreakDayState = "active" | "freeze" | "idle" | "future";

export interface StreakDay {
  date: Date;
  state: StreakDayState;
  isToday: boolean;
}

/**
 * The seven days of the week containing `today` (Monday first), each with its
 * streak state. Pure, so the compact streak strip can be tested without a
 * calendar render.
 */
export function buildStreakWeek(
  periods: readonly StreakPeriod[],
  today: Date,
): StreakDay[] {
  const midnight = new Date(today);
  midnight.setHours(0, 0, 0, 0);
  const list = [...periods];

  return getWeekDates(midnight, 1).map((date) => {
    const isToday = date.getTime() === midnight.getTime();
    const state: StreakDayState = didUseFreezeOnDate(date, list)
      ? "freeze"
      : wasDateActive(date, list)
        ? "active"
        : date > midnight
          ? "future"
          : "idle";
    return { date, state, isToday };
  });
}
