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
