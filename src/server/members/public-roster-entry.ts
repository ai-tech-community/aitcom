import { getAvatarUrl } from "@/lib/avatar";
import type { BadgeSlug } from "@/lib/badges/catalog";
import { hasAgentOnPublicRoster } from "@/lib/public-roster";
import { memberProfiles } from "@/server/db/schema";
import type { toLeaderboardSocial } from "@/server/social/present";

/**
 * One row of the public /members roster (also the room "add member" picker).
 * An explicit allow-list: only what those lists render.
 */
export interface PublicRosterEntry {
  profile: {
    userId: string;
    displayName: string;
    company: string | null;
    skills: string[];
    xp: number;
    level: number;
  };
  avatarUrl: string | null;
  badgeCount: number;
  /** Up to three of the member's rarest badges, one per track. */
  topBadges: BadgeSlug[];
  hasAgent: boolean;
  social: ReturnType<typeof toLeaderboardSocial>;
}

/**
 * Columns to select for a roster row. Pasted social URLs are read only to
 * build the verified-social marks; they are not returned.
 */
export const publicRosterColumns = {
  userId: memberProfiles.userId,
  displayName: memberProfiles.displayName,
  company: memberProfiles.company,
  skills: memberProfiles.skills,
  xp: memberProfiles.xp,
  level: memberProfiles.level,
  githubUrl: memberProfiles.githubUrl,
  linkedinUrl: memberProfiles.linkedinUrl,
  websiteUrl: memberProfiles.websiteUrl,
};

export type PublicRosterRow = Pick<
  typeof memberProfiles.$inferSelect,
  keyof typeof publicRosterColumns
>;

export function toPublicRosterEntry(input: {
  profile: PublicRosterRow;
  email: string | null;
  image: string | null;
  ownedActiveAgentId: string | null;
  badgeCount: number;
  topBadges: BadgeSlug[];
  social: PublicRosterEntry["social"];
}): PublicRosterEntry {
  const { profile } = input;
  return {
    profile: {
      userId: profile.userId,
      displayName: profile.displayName,
      company: profile.company ?? null,
      skills: profile.skills ?? [],
      xp: profile.xp,
      level: profile.level,
    },
    avatarUrl: getAvatarUrl(input.email, input.image),
    badgeCount: input.badgeCount,
    topBadges: input.topBadges,
    hasAgent: hasAgentOnPublicRoster({
      userId: profile.userId,
      ownedActiveAgentId: input.ownedActiveAgentId,
    }),
    social: input.social,
  };
}
