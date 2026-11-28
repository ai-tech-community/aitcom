import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { db } from "@/server/db";
import { communityMemberships, memberProfiles, user } from "@/server/db/schema";
import {
  directoryProfileColumns,
  toDirectoryMember,
} from "@/server/communities/directory-member";
import { profileReadableBy } from "@/server/members/profile-access";
import {
  rosterSkillMatches,
  rosterSkillValue,
} from "@/server/members/roster-skills";
import type { MembershipStatus } from "@/server/communities/invite-policy";

type RosterCursor = { joinedAt: string; userId: string };
export type PeopleFilters = {
  role?: "owner" | "admin" | "moderator" | "member";
  skill?: string;
  offset: number;
};

function readableProfiles(viewerId?: string | null) {
  return viewerId
    ? or(profileReadableBy("visitor"), eq(memberProfiles.userId, viewerId))
    : profileReadableBy("visitor");
}

export async function loadCommunityRoster(
  database: typeof db,
  input: {
    communityId: string;
    viewerId?: string | null;
    q?: string;
    cursor?: RosterCursor | null;
    status: MembershipStatus;
    limit: number;
    people?: PeopleFilters;
  },
) {
  const { people, viewerId } = input;
  const readable = readableProfiles(viewerId);
  const conditions = [
    eq(communityMemberships.communityId, input.communityId),
    eq(communityMemberships.status, input.status),
  ];
  if (input.q) {
    const search = `%${input.q.replace(/[\\%_]/g, "\\$&")}%`;
    const accountName = ilike(user.name, search);
    const bioMatch = ilike(memberProfiles.bio, search);
    const profileSearch = or(accountName, bioMatch);
    conditions.push(
      or(
        ilike(memberProfiles.displayName, search),
        people ? and(readable, profileSearch) : profileSearch,
      )!,
    );
  }
  if (people?.role) conditions.push(eq(communityMemberships.role, people.role));
  if (people?.skill)
    conditions.push(
      and(
        readable,
        rosterSkillMatches(sql`${memberProfiles.skills}`, people.skill),
      )!,
    );
  if (input.cursor) {
    conditions.push(
      sql`(${communityMemberships.joinedAt}, ${communityMemberships.userId}) < (${input.cursor.joinedAt}, ${input.cursor.userId})`,
    );
  }

  const read = database
    .select({
      userId: communityMemberships.userId,
      role: communityMemberships.role,
      joinedAt: communityMemberships.joinedAt,
      displayName: memberProfiles.displayName,
      bio: memberProfiles.bio,
      image: user.image,
      ...directoryProfileColumns(),
    })
    .from(communityMemberships)
    .innerJoin(user, eq(communityMemberships.userId, user.id))
    .leftJoin(
      memberProfiles,
      eq(communityMemberships.userId, memberProfiles.userId),
    )
    .where(and(...conditions))
    .orderBy(
      desc(communityMemberships.joinedAt),
      desc(communityMemberships.userId),
    )
    .limit(input.limit + 1);

  const rows = await (people ? read.offset(people.offset) : read);
  let nextCursor: RosterCursor | undefined;
  if (rows.length > input.limit) {
    rows.pop();
    const last = rows.at(-1)!;
    nextCursor = { joinedAt: last.joinedAt.toISOString(), userId: last.userId };
  }

  return {
    items: rows.map((row) => {
      const member = toDirectoryMember(row, viewerId);
      return people && !member.canOpenProfile
        ? { ...member, bio: null }
        : member;
    }),
    nextCursor,
  };
}

/** Skills from all active members whose profiles may be shown to the roster viewer. */
export async function loadCommunityRosterSkills(
  database: typeof db,
  communityId: string,
  viewerId?: string | null,
) {
  const skill = rosterSkillValue(sql`${memberProfiles.skills}`);
  const rows = await database
    .selectDistinct({ skill })
    .from(communityMemberships)
    .innerJoin(
      memberProfiles,
      eq(communityMemberships.userId, memberProfiles.userId),
    )
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.status, "active"),
        readableProfiles(viewerId),
      ),
    )
    .orderBy(skill)
    .limit(150);
  return rows.map((row) => row.skill).filter(Boolean);
}
