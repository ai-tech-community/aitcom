import { memberProfiles } from "@/server/db/schema";

/**
 * The member profile fields public surfaces render: the profile page, the
 * inbox profile pane, and the /members roster.
 *
 * This is an explicit allow-list. A new `member_profile` column stays off
 * public responses until it is added here on purpose.
 */
export interface PublicMemberProfile {
  userId: string;
  displayName: string;
  bio: string | null;
  skills: string[];
  company: string | null;
  websiteUrl: string | null;
  xp: number;
  level: number;
  createdAt: Date;
}

/**
 * Columns to select for a public profile. Pasted GitHub / LinkedIn URLs are
 * read only to build the social presentation; they are not returned as-is.
 */
export const publicMemberProfileColumns = {
  userId: memberProfiles.userId,
  displayName: memberProfiles.displayName,
  bio: memberProfiles.bio,
  skills: memberProfiles.skills,
  company: memberProfiles.company,
  websiteUrl: memberProfiles.websiteUrl,
  githubUrl: memberProfiles.githubUrl,
  linkedinUrl: memberProfiles.linkedinUrl,
  xp: memberProfiles.xp,
  level: memberProfiles.level,
  createdAt: memberProfiles.createdAt,
};

export type PublicMemberProfileRow = Pick<
  typeof memberProfiles.$inferSelect,
  keyof typeof publicMemberProfileColumns
>;

/** Map a selected row to the public profile shape (and nothing more). */
export function toPublicMemberProfile(
  row: Pick<PublicMemberProfileRow, keyof PublicMemberProfile>,
): PublicMemberProfile {
  return {
    userId: row.userId,
    displayName: row.displayName,
    bio: row.bio ?? null,
    skills: row.skills ?? [],
    company: row.company ?? null,
    websiteUrl: row.websiteUrl ?? null,
    xp: row.xp,
    level: row.level,
    createdAt: row.createdAt,
  };
}
