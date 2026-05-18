import { eq, sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";
import { user, memberProfiles, memberBadges } from "@/server/db/schema";

type DB = typeof _db;

// Per ADR-0007 decision 1, contributor weight is inherited from the
// contributor's existing AIT profile, not earned by submitting runs.
// The initial formula is intentionally conservative: brand-new accounts
// near the floor, established members near 1.0. Tune over time.

export const CONTRIBUTOR_WEIGHT_MIN = 0.1;
export const CONTRIBUTOR_WEIGHT_MAX = 1.0;

export type ContributorWeightInputs = {
  accountAgeDays: number;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  badgeCount: number;
};

export function computeContributorWeightFromInputs(
  i: ContributorWeightInputs,
): number {
  let w = CONTRIBUTOR_WEIGHT_MIN;
  if (i.accountAgeDays >= 30) w += 0.4;
  else if (i.accountAgeDays >= 7) w += 0.2;
  if (i.emailVerified) w += 0.1;
  if (i.onboardingCompleted) w += 0.2;
  w += Math.min(0.2, i.badgeCount * 0.05);
  if (w > CONTRIBUTOR_WEIGHT_MAX) w = CONTRIBUTOR_WEIGHT_MAX;
  if (w < CONTRIBUTOR_WEIGHT_MIN) w = CONTRIBUTOR_WEIGHT_MIN;
  return Math.round(w * 100) / 100;
}

export async function computeContributorWeight(
  db: DB,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const [row] = await db
    .select({
      createdAt: user.createdAt,
      emailVerified: user.emailVerified,
      onboardingCompleted: memberProfiles.onboardingCompleted,
      badgeCount: sql<number>`count(${memberBadges.id})`.mapWith(Number),
    })
    .from(user)
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .leftJoin(memberBadges, eq(memberBadges.userId, user.id))
    .where(eq(user.id, userId))
    .groupBy(user.id, memberProfiles.userId)
    .limit(1);

  if (!row) return CONTRIBUTOR_WEIGHT_MIN;

  const accountAgeDays = Math.max(
    0,
    Math.floor((now.getTime() - row.createdAt.getTime()) / 86_400_000),
  );

  return computeContributorWeightFromInputs({
    accountAgeDays,
    emailVerified: row.emailVerified ?? false,
    onboardingCompleted: row.onboardingCompleted ?? false,
    badgeCount: row.badgeCount ?? 0,
  });
}
