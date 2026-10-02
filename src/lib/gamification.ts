import { eq, sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as schema from "@/server/db/schema";
import { memberProfiles, pointsEvents } from "@/server/db/schema";

// --- XP Amounts ---

export const XP_AMOUNTS = {
  PROFILE_COMPLETE: 50,
  REGISTER_EVENT: 25,
  ATTEND_EVENT: 100,
  FIRST_EVENT_BONUS: 50,
  AGENT_SETUP: 25,
  ONBOARDING_STEP: 10,
  ONBOARDING_COMPLETE: 50,
  CHALLENGE_PROPOSE_PUBLISHED: 50,
  CHALLENGE_ENROLL: 10,
  CHALLENGE_CHANNEL_POST: 5,
  CHALLENGE_ANSWER_QUESTION: 10,
  CHALLENGE_SOLUTION_APPROVED: 25,
  ARTICLE_SUBMITTED: 10,
  ARTICLE_PUBLISHED: 50,
  FORUM_THREAD_CREATE: 10,
  FORUM_REPLY_CREATE: 5,
  FORUM_RECEIVE_REPLY: 3,
  LAUNCHPAD_PROJECT_CREATE: 15,
  LAUNCHPAD_UPDATE_POST: 10,
  LAUNCHPAD_COMMENT_CREATE: 5,
  LAUNCHPAD_RECEIVE_VOTE: 3,
  LAUNCHPAD_RECEIVE_COMMENT: 3,
  COURSE_RECEIVE_ENROLLMENT: 3,
  ARTICLE_COMMENT_CREATE: 5,
  FEED_POST_CREATE: 10,
  FEED_COMMENT_CREATE: 5,
  FEED_RECEIVE_LIKE: 2,
  FEED_RECEIVE_COMMENT: 3,
  REFERRAL_ACTIVATED: 50,
  COURSE_COMPLETE: 50,
} as const;

// --- Leveling ---

export function calculateLevel(xp: number): number {
  return Math.floor(xp / 200) + 1;
}

export function xpForNextLevel(currentXp: number): {
  current: number;
  needed: number;
} {
  const level = calculateLevel(currentXp);
  const levelStart = (level - 1) * 200;
  return {
    current: currentXp - levelStart,
    needed: 200,
  };
}

// --- Tiers (presentation only) ---
//
// A named-tier overlay on top of the linear XP/level model — purely for
// display (badges, profile labels). It does NOT change how XP or `level`
// are computed (still floor(xp/200)+1); it maps an XP total to a tier label.
// Translate the returned `key` via the `tiers` i18n namespace.

export const LEVEL_TIERS = [
  { key: "beginner", minXp: 0 },
  { key: "novice", minXp: 500 },
  { key: "intermediate", minXp: 1000 },
  { key: "professional", minXp: 1500 },
  { key: "expert", minXp: 2000 },
  { key: "master", minXp: 2500 },
  { key: "grandMaster", minXp: 3000 },
  { key: "enlightened", minXp: 3500 },
] as const;

export type LevelTierKey = (typeof LEVEL_TIERS)[number]["key"];

/** Returns the highest tier whose `minXp` the given XP total has reached. */
export function tierForXp(xp: number): (typeof LEVEL_TIERS)[number] {
  let tier: (typeof LEVEL_TIERS)[number] = LEVEL_TIERS[0];
  for (const candidate of LEVEL_TIERS) {
    if (xp >= candidate.minXp) tier = candidate;
  }
  return tier;
}

// --- Streaks (derived from activity, no dedicated table) ---

export type StreakPeriod = { periodStart: string; periodEnd: string };

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  total: number;
  streak: StreakPeriod[];
}

const DAY_MS = 86_400_000;
const toUtc = (day: string) => Date.parse(`${day}T00:00:00Z`);

/**
 * Collapse a sorted-ascending list of unique active days (YYYY-MM-DD) into
 * runs of consecutive days, for a streak calendar.
 */
export function toStreakPeriods(days: readonly string[]): StreakPeriod[] {
  const periods: StreakPeriod[] = [];
  for (const day of days) {
    const last = periods[periods.length - 1];
    if (last && toUtc(day) - toUtc(last.periodEnd) === DAY_MS) {
      last.periodEnd = day;
    } else {
      periods.push({ periodStart: day, periodEnd: day });
    }
  }
  return periods;
}

/**
 * Collapse a sorted-ascending list of unique active days (YYYY-MM-DD) into
 * consecutive-day periods plus streak stats. An "active day" is any day with
 * at least one activity event. `today` (YYYY-MM-DD) is passed in so the result
 * is deterministic and unit-testable. The current streak counts only if the
 * most recent active day is today or yesterday (a one-day grace for "today
 * not done yet").
 */
export function computeStreakData(days: string[], today: string): StreakData {
  const periods = toStreakPeriods(days);

  if (periods.length === 0) {
    return { currentStreak: 0, longestStreak: 0, total: 0, streak: [] };
  }

  const lengthOf = (p: StreakPeriod) =>
    Math.round((toUtc(p.periodEnd) - toUtc(p.periodStart)) / DAY_MS) + 1;
  const longestStreak = Math.max(...periods.map(lengthOf));
  const last = periods[periods.length - 1]!;
  const gapToToday = Math.round(
    (toUtc(today) - toUtc(last.periodEnd)) / DAY_MS,
  );
  const currentStreak = gapToToday <= 1 ? lengthOf(last) : 0;

  return { currentStreak, longestStreak, total: days.length, streak: periods };
}

/**
 * Map a points-event `reason` code to one of the four trigger types the
 * dashboard's recent-XP list knows how to icon (this drives the icon only —
 * not visible text, so it needs no i18n).
 */
export function pointsTriggerType(
  reason: string,
): "metric" | "achievement" | "streak" | "time" {
  if (reason.includes("streak")) return "streak";
  if (
    reason.includes("complete") ||
    reason.includes("badge") ||
    reason.includes("achievement") ||
    reason.includes("published")
  ) {
    return "achievement";
  }
  return "metric";
}

// --- DB Helpers ---

// Accept either the root db or a transaction handle so XP/badge writes can be
// threaded into a caller's transaction (e.g. verifyCellResult's atomic
// result-flip + XP award, CR-3).
type Tx = Parameters<
  Parameters<NeonDatabase<typeof schema>["transaction"]>[0]
>[0];
type DB = NeonDatabase<typeof schema> | Tx;

/**
 * Resolve the multiplier of the currently-active XP boost (admin-managed
 * campaign), or 1 if none. Guarded so a missing table / failed read never
 * breaks XP awarding.
 */
async function activeBoostMultiplier(db: DB): Promise<number> {
  try {
    const res = await db.execute(sql`
      SELECT "multiplier" FROM "public"."points_boosts"
      WHERE "enabled" = true AND now() >= "starts_at" AND now() <= "ends_at"
      ORDER BY "multiplier" DESC
      LIMIT 1
    `);
    const raw = res.rows[0]?.multiplier;
    const m = raw == null ? 1 : Number(raw);
    return Number.isFinite(m) && m >= 1 ? m : 1;
  } catch {
    return 1;
  }
}

/**
 * Award XP to a user, recalculate their level, and append a points_event row
 * (for points history + the XP-over-time chart). An active boost multiplies the
 * base amount. No-op if the user has no profile yet. `reason` is a short machine
 * code (e.g. "course.complete") shown in the history; defaults to "activity".
 */
export async function awardXp(
  db: DB,
  userId: string,
  amount: number,
  reason = "activity",
) {
  const multiplier = await activeBoostMultiplier(db);
  const effective = Math.round(amount * multiplier);

  const [updated] = await db
    .update(memberProfiles)
    .set({
      xp: sql`${memberProfiles.xp} + ${effective}`,
      level: sql`floor((${memberProfiles.xp} + ${effective}) / 200) + 1`,
    })
    .where(eq(memberProfiles.userId, userId))
    .returning({ xp: memberProfiles.xp });

  // Only log when a profile actually got updated (preserves the no-op contract).
  if (updated) {
    await db.insert(pointsEvents).values({
      userId,
      amount: effective,
      reason,
      totalAfter: updated.xp,
      metadata:
        multiplier !== 1 ? { boost: multiplier, base: amount } : undefined,
    });
  }
}

/**
 * Check if profile is complete (all key fields filled).
 */
export function isProfileComplete(profile: {
  displayName: string;
  bio: string | null;
  skills: string[];
  company: string | null;
}): boolean {
  return (
    profile.displayName.length > 0 &&
    !!profile.bio &&
    profile.bio.length > 0 &&
    profile.skills.length > 0 &&
    !!profile.company &&
    profile.company.length > 0
  );
}

/**
 * Check if a member qualifies as a trusted author.
 * Requires level 5+ (800 XP) AND the article_author badge.
 */
export function isTrustedAuthor(
  xp: number,
  badges: { badgeSlug: string }[],
): boolean {
  const level = calculateLevel(xp);
  const hasAuthorBadge = badges.some((b) => b.badgeSlug === "article_author");
  return level >= 5 && hasAuthorBadge;
}
