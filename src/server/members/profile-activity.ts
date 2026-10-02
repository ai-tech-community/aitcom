import { eq, sql } from "drizzle-orm";

import { computeStreakData } from "@/lib/gamification";
import type { db as appDb } from "@/server/db";
import { pointsEvents } from "@/server/db/schema";

type Db = typeof appDb;

/** How far back the public calendar reaches, today included. */
export const ACTIVITY_CALENDAR_DAYS = 365;

/** One active day on the public calendar: the date and the XP earned. */
export interface ProfileActivityDay {
  /** UTC calendar day, YYYY-MM-DD. */
  date: string;
  xp: number;
}

/**
 * A member's public activity. An explicit allow-list: dates and day totals
 * only. It is read from `points_event` and never from `activity_event`,
 * whose rows carry private context; the reason codes are not selected.
 */
export interface ProfileActivity {
  /** Active days within the calendar window, oldest first. */
  days: ProfileActivityDay[];
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
 * Shape the per-day totals (sorted ascending, all time) into the public
 * activity: streaks over every day, the calendar over the window only.
 */
export function toProfileActivity(
  allDays: readonly ProfileActivityDay[],
  today: string,
): ProfileActivity {
  const { currentStreak, longestStreak } = computeStreakData(
    allDays.map((day) => day.date),
    today,
  );
  const from = activityWindowStart(today);
  return {
    days: allDays
      .filter((day) => day.date >= from && day.date <= today)
      .map((day) => ({ date: day.date, xp: day.xp })),
    currentStreak,
    longestStreak,
  };
}

/**
 * Load a member's public activity. The caller checks the profile is visible
 * to the viewer first. Days are UTC, the same as the dashboard streak.
 */
export async function loadProfileActivity(
  database: Db,
  { userId, today }: { userId: string; today: string },
): Promise<ProfileActivity> {
  const dayExpr = sql<string>`to_char(${pointsEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
  const rows = await database
    .select({
      date: dayExpr,
      xp: sql<number>`coalesce(sum(${pointsEvents.amount}), 0)`.mapWith(Number),
    })
    .from(pointsEvents)
    .where(eq(pointsEvents.userId, userId))
    .groupBy(dayExpr)
    .orderBy(dayExpr);

  return toProfileActivity(rows, today);
}
