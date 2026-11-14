import { sql } from "drizzle-orm";

import {
  calculateLevel,
  tierForXp,
  type LevelTierKey,
} from "@/lib/gamification";
import { memberProfiles } from "@/server/db/schema";
import { profileReadableBy } from "@/server/members/profile-access";

/** How many skills a directory row carries for its preview card. */
export const DIRECTORY_SKILL_LIMIT = 5;

/**
 * Columns a community directory row needs beyond the roster basics, spread
 * into the `getMembers` select. `profilePublic` applies the same rule as
 * the profile page (`members.getPublicProfile`) for a visitor, so the
 * directory never links to, or previews, a profile that page would 404.
 */
export function directoryProfileColumns() {
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

export type DirectoryMemberRow = {
  userId: string;
  role: string;
  joinedAt: Date;
  displayName: string | null;
  bio: string | null;
  image: string | null;
  profilePublic: boolean;
  company: string | null;
  skills: string[] | null;
  xp: number | null;
};

/** Public profile details shown in a directory row's preview card. */
export type DirectoryMemberProfile = {
  company: string | null;
  skills: string[];
  level: number;
  tier: LevelTierKey;
};

export type DirectoryMember = Omit<
  DirectoryMemberRow,
  "profilePublic" | "company" | "skills" | "xp"
> & {
  /** The viewer may open `/members/[userId]` without hitting a 404. */
  canOpenProfile: boolean;
  /** Null when the viewer may not see the profile, or it does not exist. */
  profile: DirectoryMemberProfile | null;
};

/**
 * Shape one directory row for this viewer. Profile details leave the server
 * only when the profile page would show them: the profile is public, or the
 * viewer is its owner. An owner with no profile row can still open their
 * page (it offers setup), but has no details to preview.
 */
export function toDirectoryMember(
  row: DirectoryMemberRow,
  viewerId: string | null | undefined,
): DirectoryMember {
  const { profilePublic, company, skills, xp, ...roster } = row;
  const isOwner = viewerId != null && viewerId === row.userId;
  const canOpenProfile = isOwner || profilePublic;
  const hasProfile = xp != null;
  return {
    ...roster,
    canOpenProfile,
    profile:
      canOpenProfile && hasProfile
        ? {
            company: company ?? null,
            skills: (skills ?? []).slice(0, DIRECTORY_SKILL_LIMIT),
            level: calculateLevel(xp),
            tier: tierForXp(xp).key,
          }
        : null,
  };
}
