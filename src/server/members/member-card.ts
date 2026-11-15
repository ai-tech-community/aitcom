import { eq, inArray, sql } from "drizzle-orm";

import {
  calculateLevel,
  tierForXp,
  type LevelTierKey,
} from "@/lib/gamification";
import type { db as Db } from "@/server/db";
import { memberProfiles, user } from "@/server/db/schema";
import { profileReadableBy } from "@/server/members/profile-access";

type Database = typeof Db;

/** How many skills a member's preview card carries. */
export const MEMBER_CARD_SKILL_LIMIT = 5;

/** Public profile details a member's preview card shows. */
export type MemberCardProfile = {
  company: string | null;
  skills: string[];
  level: number;
  tier: LevelTierKey;
};

/**
 * What a viewer may learn about a member wherever their name appears: may
 * the name link to `/members/[id]`, and what its hover preview shows.
 */
export type MemberCardAccess = {
  /** The viewer may open `/members/[userId]` without hitting a 404. */
  canOpenProfile: boolean;
  /** Null when the viewer may not see the profile, or it does not exist. */
  profile: MemberCardProfile | null;
};

/** A member's preview card, for names shown outside the directory. */
export type MemberCard = MemberCardAccess & {
  /** The profile's bio, only when the viewer may see the profile. */
  bio: string | null;
};

/**
 * Columns `toMemberCardAccess` needs, spread into a select that left-joins
 * `member_profile`. `profilePublic` applies the same rule as the profile
 * page (`members.getPublicProfile`) for a visitor, so a name never links
 * to, or previews, a profile that page would 404.
 */
export function memberCardColumns() {
  return {
    profilePublic:
      sql<boolean>`coalesce(${profileReadableBy("visitor")}, false)`.mapWith(
        Boolean,
      ),
    company: memberProfiles.company,
    skills: memberProfiles.skills,
    xp: memberProfiles.xp,
  };
}

export type MemberCardRow = {
  userId: string;
  profilePublic: boolean;
  company: string | null;
  skills: string[] | null;
  xp: number | null;
};

/**
 * Decide, for this viewer, whether a member's profile opens and what its
 * preview may show. Details leave the server only when the profile page
 * would show them: the profile is public, or the viewer is its owner. An
 * owner with no profile row can still open their page (it offers setup),
 * but has no details to preview.
 */
export function toMemberCardAccess(
  row: MemberCardRow,
  viewerId: string | null | undefined,
): MemberCardAccess {
  const isOwner = viewerId != null && viewerId === row.userId;
  const canOpenProfile = isOwner || row.profilePublic;
  const hasProfile = row.xp != null;
  return {
    canOpenProfile,
    profile:
      canOpenProfile && hasProfile
        ? {
            company: row.company ?? null,
            skills: (row.skills ?? []).slice(0, MEMBER_CARD_SKILL_LIMIT),
            level: calculateLevel(row.xp!),
            tier: tierForXp(row.xp!).key,
          }
        : null,
  };
}

/** A member whose card the viewer may not open: no link, no details. */
export const CLOSED_MEMBER_CARD: MemberCard = {
  canOpenProfile: false,
  profile: null,
  bio: null,
};

/** One member as a feed shows them: their photo and their card. */
export type MemberFacts = { image: string | null; card: MemberCard };

/**
 * Photo and preview card of each member in `userIds`, shaped for this
 * viewer, in one query. A member missing from the result (no account) has
 * neither; callers fall back to `CLOSED_MEMBER_CARD`.
 */
export async function loadMemberCards(
  database: Database,
  userIds: readonly string[],
  viewerId: string | null | undefined,
): Promise<Map<string, MemberFacts>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const facts = new Map<string, MemberFacts>();
  if (ids.length === 0) return facts;
  const rows = await database
    .select({
      userId: user.id,
      image: user.image,
      bio: memberProfiles.bio,
      ...memberCardColumns(),
    })
    .from(user)
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .where(inArray(user.id, ids));
  for (const row of rows) {
    const access = toMemberCardAccess(row, viewerId);
    facts.set(row.userId, {
      image: row.image,
      card: {
        ...access,
        bio: access.canOpenProfile ? (row.bio ?? null) : null,
      },
    });
  }
  return facts;
}
