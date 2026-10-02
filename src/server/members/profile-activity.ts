import { computeStreakData } from "@/lib/gamification";
import type { db as appDb } from "@/server/db";
import { memberActiveDays } from "@/server/members/active-days";

type Db = typeof appDb;

/** How far back the public calendar reaches, today included. */
export const ACTIVITY_CALENDAR_DAYS = 365;

/**
 * A member's public activity. An explicit allow-list: active dates and the
 * streaks only. What the member did on a day never leaves the server.
 */
export interface ProfileActivity {
  /** Active UTC days (YYYY-MM-DD) within the calendar window, oldest first. */
  days: string[];
  /** Consecutive active days up to today (or yesterday). */
  currentStreak: number;
  /** Longest run of consecutive active days, all time. */
  longestStreak: number;
}

/** The first day (YYYY-MM-DD) the calendar shows, given today. */
export function activityWindowStart(today: string): string {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (ACTIVITY_CALENDAR_DAYS - 1));
  return start.toISOString().slice(0, 10);
}

/**
 * Shape a member's active days (sorted ascending, all time) into the public
 * activity: streaks over every day, the same as the dashboard streak, and
 * the calendar over the window only.
 */
export function toProfileActivity(
  allDays: readonly string[],
  today: string,
): ProfileActivity {
  const { currentStreak, longestStreak } = computeStreakData(
    [...allDays],
    today,
  );
  const from = activityWindowStart(today);
  return {
    days: allDays.filter((day) => day >= from && day <= today),
    currentStreak,
    longestStreak,
  };
}

/**
 * Load a member's public activity from the shared active-days source. The
 * caller checks the profile is visible to the viewer first.
 */
export async function loadProfileActivity(
  database: Db,
  { userId, today }: { userId: string; today: string },
): Promise<ProfileActivity> {
  return toProfileActivity(await memberActiveDays(database, userId), today);
}
