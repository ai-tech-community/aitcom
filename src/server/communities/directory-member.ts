import {
  memberCardColumns,
  toMemberCardAccess,
  type MemberCardAccess,
  type MemberCardProfile,
} from "@/server/members/member-card";

/**
 * Columns a community directory row needs beyond the roster basics, spread
 * into the `getMembers` select: the member card's columns, so the directory
 * links and previews exactly as every other place a name appears.
 */
export const directoryProfileColumns = memberCardColumns;

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
export type DirectoryMemberProfile = MemberCardProfile;

export type DirectoryMember = Omit<
  DirectoryMemberRow,
  "profilePublic" | "company" | "skills" | "xp"
> &
  MemberCardAccess;

/**
 * Shape one directory row for this viewer: the roster fields, plus the
 * member card's rule for whether the profile opens and what it previews.
 */
export function toDirectoryMember(
  row: DirectoryMemberRow,
  viewerId: string | null | undefined,
): DirectoryMember {
  const { profilePublic: _p, company: _c, skills: _s, xp: _x, ...roster } = row;
  return { ...roster, ...toMemberCardAccess(row, viewerId) };
}
