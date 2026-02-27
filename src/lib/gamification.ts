import { eq, sql, and } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/server/db/schema";
import { memberProfiles, memberBadges, eventRegistrations, activityEvents } from "@/server/db/schema";

// --- Badge Definitions ---

export interface BadgeDefinition {
  slug: string;
  name: string;
  description: string;
  icon?: string;
}

export const BADGES: Record<string, BadgeDefinition> = {
  profile_complete: {
    slug: "profile_complete",
    name: "Profile Complete",
    description: "Filled out all profile fields",
  },
  first_event: {
    slug: "first_event",
    name: "First Event",
    description: "Attended your first event",
  },
  regular: {
    slug: "regular",
    name: "Regular",
    description: "Attended 3 events",
  },
  veteran: {
    slug: "veteran",
    name: "Veteran",
    description: "Attended 10 events",
  },
  early_adopter: {
    slug: "early_adopter",
    name: "Early Adopter",
    description: "Among the first 100 members",
  },
  speaker: {
    slug: "speaker",
    name: "Speaker",
    description: "Listed as a speaker at an event",
  },
  agent_master: {
    slug: "agent_master",
    name: "Agent Master",
    description: "Your AI agent made 10+ contributions",
    icon: "🤖",
  },
  onboarding_complete: {
    slug: "onboarding_complete",
    name: "Onboarding Complete",
    description: "Finished all onboarding steps",
  },
  first_challenge: {
    slug: "first_challenge",
    name: "First Challenge",
    description: "Completed your first challenge",
  },
  challenge_streak_3: {
    slug: "challenge_streak_3",
    name: "Streak Master",
    description: "Completed 3 consecutive weekly challenges",
  },
  challenge_streak_10: {
    slug: "challenge_streak_10",
    name: "Unstoppable",
    description: "Completed 10 consecutive weekly challenges",
  },
  challenge_proposer: {
    slug: "challenge_proposer",
    name: "Challenge Proposer",
    description: "Your proposed challenge was published",
  },
  mission_impossible: {
    slug: "mission_impossible",
    name: "Mission Impossible",
    description: "Completed a monthly challenge in the first week",
  },
  repo_first: {
    slug: "repo_first",
    name: "Repo Warrior",
    description: "Completed your first repo-based challenge",
    icon: "🏗️",
  },
  test_perfect: {
    slug: "test_perfect",
    name: "Test Master",
    description: "100% test pass on a challenge with 10+ tests",
    icon: "✅",
  },
  challenge_helper: {
    slug: "challenge_helper",
    name: "Helpful Hand",
    description: "Answered 10 questions across challenge channels",
    icon: "🤝",
  },
  sponsor_pick: {
    slug: "sponsor_pick",
    name: "Sponsor's Pick",
    description: "A sponsor approved your peer-review solution",
    icon: "⭐",
  },
  challenge_author: {
    slug: "challenge_author",
    name: "Challenge Author",
    description: "Published a challenge that got 5+ enrollments",
    icon: "📝",
  },
  speed_demon: {
    slug: "speed_demon",
    name: "Speed Demon",
    description: "Completed a weekly challenge in under 24 hours",
    icon: "⚡",
  },
  agent_collab: {
    slug: "agent_collab",
    name: "Full Stack Agent",
    description: "Completed a challenge where your agent posted 5+ progress updates",
    icon: "🤖",
  },
  streak_10: {
    slug: "streak_10",
    name: "Streak Master",
    description: "Completed 10 challenges",
    icon: "🔥",
  },
  article_author: {
    slug: "article_author",
    name: "Article Author",
    description: "Had your first article approved and published",
    icon: "✍️",
  },
  prolific_writer: {
    slug: "prolific_writer",
    name: "Prolific Writer",
    description: "Published 5 articles",
    icon: "📚",
  },
  tutorial_creator: {
    slug: "tutorial_creator",
    name: "Tutorial Creator",
    description: "Published your first tutorial",
    icon: "🎓",
  },
};

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
} as const;

// --- Leveling ---

export function calculateLevel(xp: number): number {
  return Math.floor(xp / 200) + 1;
}

export function xpForNextLevel(currentXp: number): { current: number; needed: number } {
  const level = calculateLevel(currentXp);
  const levelStart = (level - 1) * 200;
  return {
    current: currentXp - levelStart,
    needed: 200,
  };
}

// --- DB Helpers ---

type DB = NeonHttpDatabase<typeof schema>;

/**
 * Award XP to a user and recalculate their level.
 * No-op if the user has no profile yet.
 */
export async function awardXp(db: DB, userId: string, amount: number) {
  await db
    .update(memberProfiles)
    .set({
      xp: sql`${memberProfiles.xp} + ${amount}`,
      level: sql`floor((${memberProfiles.xp} + ${amount}) / 200) + 1`,
    })
    .where(eq(memberProfiles.userId, userId));
}

/**
 * Award a badge if not already earned. Returns true if newly awarded.
 * Uses INSERT ... ON CONFLICT DO NOTHING to avoid race conditions.
 */
export async function awardBadge(
  db: DB,
  userId: string,
  badgeSlug: string,
): Promise<boolean> {
  const [result] = await db
    .insert(memberBadges)
    .values({ userId, badgeSlug })
    .onConflictDoNothing()
    .returning();

  if (result) {
    await db.insert(activityEvents).values({
      actorId: userId,
      actorType: "member",
      action: "badge.earned",
      targetType: "member_badge",
      targetId: result.id,
      metadata: { badgeSlug, badgeName: BADGES[badgeSlug]?.name ?? badgeSlug },
    });
  }

  return !!result;
}

/**
 * Check and award attendance-based badges based on current count.
 */
export async function checkAttendanceBadges(db: DB, userId: string) {
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.userId, userId),
        eq(eventRegistrations.status, "attended"),
      ),
    );

  const attended = countResult?.count ?? 0;

  if (attended >= 1) {
    const isFirst = await awardBadge(db, userId, "first_event");
    if (isFirst) {
      await awardXp(db, userId, XP_AMOUNTS.FIRST_EVENT_BONUS);
    }
  }
  if (attended >= 3) await awardBadge(db, userId, "regular");
  if (attended >= 10) await awardBadge(db, userId, "veteran");
}

/**
 * Check if user qualifies for the early_adopter badge.
 */
export async function checkEarlyAdopterBadge(db: DB, userId: string) {
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(memberProfiles);

  const totalProfiles = countResult?.count ?? 0;
  if (totalProfiles <= 100) {
    await awardBadge(db, userId, "early_adopter");
  }
}

/**
 * Check and award the agent_master badge based on agent contributions.
 */
export async function checkAgentBadge(
  db: DB,
  userId: string,
  agentContributions: number,
) {
  if (agentContributions >= 10) {
    await awardBadge(db, userId, "agent_master");
  }
}

/**
 * Check and award challenge-related badges based on completion count.
 */
export async function checkChallengeBadges(
  db: DB,
  userId: string,
  completedCount: number,
  consecutiveWeekly: number,
  challengeType: "weekly" | "monthly",
  daysToComplete: number,
) {
  if (completedCount >= 1) {
    await awardBadge(db, userId, "first_challenge");
  }
  if (consecutiveWeekly >= 3) {
    await awardBadge(db, userId, "challenge_streak_3");
  }
  if (consecutiveWeekly >= 10) {
    await awardBadge(db, userId, "challenge_streak_10");
  }
  if (challengeType === "monthly" && daysToComplete <= 7) {
    await awardBadge(db, userId, "mission_impossible");
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

/**
 * Check and award article-related badges based on published count and type.
 */
export async function checkArticleBadges(
  db: DB,
  userId: string,
  publishedCount: number,
  articleType: string,
) {
  if (publishedCount >= 1) {
    await awardBadge(db, userId, "article_author");
  }
  if (publishedCount >= 5) {
    await awardBadge(db, userId, "prolific_writer");
  }
  if (articleType === "tutorial") {
    await awardBadge(db, userId, "tutorial_creator");
  }
}
