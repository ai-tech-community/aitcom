import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";

import type { BadgeSlug } from "@/lib/badges/catalog";
import { featuredBadges } from "@/lib/badges/showcase";
import { memberHeadline } from "@/lib/member-directory";
import { holdersOf, optionalBadgeRarity } from "@/server/badges/rarity";
import { publicCommunitySql } from "@/server/communities/content-visibility-queries";
import { HUB_SLUG } from "@/server/communities/hub";
import type { db } from "@/server/db";
import {
  activityEvents,
  agentProfiles,
  communities,
  communityMemberships,
  memberBadges,
  memberProfiles,
  user,
} from "@/server/db/schema";
import {
  displayableBadgeRows,
  toDisplayableBadges,
} from "@/server/members/displayable-badges";
import {
  rosterSkillMatches,
  rosterSkillValue,
} from "@/server/members/roster-skills";
import { activityWindowStart } from "@/server/members/profile-activity";
import {
  publicRosterEmailVisibility,
  publicRosterVisibility,
} from "@/server/members/public-roster";
import {
  publicRosterColumns,
  toPublicRosterEntry,
  type PublicRosterEntry,
} from "@/server/members/public-roster-entry";
import {
  loadGithubAccountIds,
  loadSocialIdentitiesForUsers,
  presentMemberSocials,
  toLeaderboardSocial,
} from "@/server/social/present";

const ROSTER_BADGE_LIMIT = 3;

export type PublicRosterView = "directory" | "leaderboard";
export type PresentedRosterEntry = PublicRosterEntry & {
  headline?: string | null;
  joinedAt?: Date;
  community?: { name: string; role: string };
};

/** The Hub only captions membership in live communities whose rosters are public. */
async function loadRosterCommunities(database: typeof db, userIds: string[]) {
  const { userId, role, status, communityId } = communityMemberships;
  const rows = await database
    .selectDistinctOn([userId], { userId, name: communities.name, role })
    .from(communityMemberships)
    .innerJoin(communities, eq(communities.id, communityId))
    .where(
      and(
        inArray(userId, userIds),
        eq(status, "active"),
        ne(communities.slug, HUB_SLUG),
        isNull(communities.deletedAt),
        publicCommunitySql(),
      ),
    )
    .orderBy(
      userId,
      sql`(${role} = 'member')`,
      communities.name,
      communities.id,
    );
  return new Map(
    rows.map(({ userId, name, role }) => [userId, { name, role }]),
  );
}

export function escapeRosterSearch(search?: string) {
  return search?.replace(/[\\%_]/g, "\\$&");
}

/** Order before paging. Activity comes from the same member events as the profile calendar. */
export function publicRosterOrder(view?: PublicRosterView, search?: string) {
  if (view !== "directory") {
    return view === "leaderboard"
      ? [desc(memberProfiles.xp), memberProfiles.userId]
      : [desc(memberProfiles.xp)];
  }

  const today = new Date().toISOString().slice(0, 10);
  const activityDay = sql`(${activityEvents.createdAt} at time zone 'UTC')::date`;
  const recentActivity = sql`(
    select max(${activityDay})
    from ${activityEvents}
    where ${activityEvents.actorId} = ${memberProfiles.userId}
      and ${activityEvents.actorType} = 'member'
      and ${activityDay} between ${activityWindowStart(today)}::date and ${today}::date
  ) desc nulls last`;
  const recent = [
    recentActivity,
    desc(memberProfiles.createdAt),
    memberProfiles.userId,
  ];
  if (!search) return recent;

  const prefix = `${search}%`;
  const relevance = sql`case
    when ${memberProfiles.displayName} ilike ${search} then 0
    when ${memberProfiles.displayName} ilike ${prefix} then 1
    when ${memberProfiles.displayName} ilike ${`%${search}%`} then 2
    when ${memberProfiles.company} ilike ${search} then 3
    when ${memberProfiles.company} ilike ${prefix} then 4
    else 5
  end`;
  return [relevance, ...recent];
}

/** Real public profile skills, subject to the same roster visibility rules. */
export async function loadPublicRosterSkills(database: typeof db) {
  const skill = rosterSkillValue(sql`${memberProfiles.skills}`);
  const rows = await database
    .selectDistinct({ skill })
    .from(memberProfiles)
    .innerJoin(user, eq(memberProfiles.userId, user.id))
    .where(and(publicRosterVisibility(), publicRosterEmailVisibility()))
    .orderBy(skill)
    .limit(150);
  return rows.map((row) => row.skill).filter(Boolean);
}

/** One roster read for the existing API and the redesigned Hub views. */
export async function loadPublicRoster(
  database: typeof db,
  input: {
    search?: string;
    skill?: string;
    cursor: number;
    limit: number;
    view?: PublicRosterView;
  },
): Promise<{ items: PresentedRosterEntry[]; nextCursor: number | null }> {
  const conditions = [publicRosterVisibility(), publicRosterEmailVisibility()];

  const escapedSearch = input.view
    ? escapeRosterSearch(input.search)
    : input.search;
  if (escapedSearch) {
    conditions.push(
      or(
        ilike(memberProfiles.displayName, `%${escapedSearch}%`),
        ilike(memberProfiles.company, `%${escapedSearch}%`),
      ),
    );
  }
  if (input.view && input.skill) {
    conditions.push(
      rosterSkillMatches(sql`${memberProfiles.skills}`, input.skill),
    );
  }

  const profiles = await database
    .select({
      profile: publicRosterColumns,
      email: user.email,
      image: user.image,
      ...(input.view
        ? { bio: memberProfiles.bio, joinedAt: memberProfiles.createdAt }
        : {}),
      agentId: agentProfiles.id,
    })
    .from(memberProfiles)
    .innerJoin(user, eq(memberProfiles.userId, user.id))
    .leftJoin(
      agentProfiles,
      and(
        eq(agentProfiles.ownerId, memberProfiles.userId),
        eq(agentProfiles.status, "active"),
      ),
    )
    .where(and(...conditions))
    .orderBy(...publicRosterOrder(input.view, escapedSearch))
    .offset(input.cursor)
    .limit(input.limit + 1); // +1 to check if there are more

  const hasMore = profiles.length > input.limit;
  const items = hasMore ? profiles.slice(0, input.limit) : profiles;

  // Existing API callers retain the post-page skill filter.
  const filtered =
    !input.view && input.skill
      ? items.filter((item) =>
          (item.profile.skills ?? []).some(
            (s) => s.toLowerCase() === input.skill?.toLowerCase(),
          ),
        )
      : items;

  // Each member's displayable badges: the count and the rarest few.
  const memberIds = filtered.map((m) => m.profile.userId);
  const [
    badgeRows,
    rarity,
    identitiesByUser,
    githubAccountIds,
    rosterCommunities,
  ] = await Promise.all([
    memberIds.length > 0
      ? database
          .select({
            userId: memberBadges.userId,
            badgeSlug: memberBadges.badgeSlug,
            earnedAt: memberBadges.earnedAt,
          })
          .from(memberBadges)
          .where(
            and(
              inArray(memberBadges.userId, memberIds),
              displayableBadgeRows(),
            ),
          )
          // Newest first, then by slug: a stable order for the
          // recent fallback and for equally rare badges.
          .orderBy(
            memberBadges.userId,
            desc(memberBadges.earnedAt),
            memberBadges.badgeSlug,
          )
      : Promise.resolve([]),
    optionalBadgeRarity(database),
    loadSocialIdentitiesForUsers(database, memberIds),
    loadGithubAccountIds(database, memberIds),
    input.view && memberIds.length > 0
      ? loadRosterCommunities(database, memberIds)
      : undefined,
  ]);
  const heldByMember = new Map<string, BadgeSlug[]>();
  for (const badge of badgeRows) {
    const [displayable] = toDisplayableBadges([badge]);
    if (!displayable) continue;
    const held = heldByMember.get(badge.userId) ?? [];
    held.push(displayable.slug);
    heldByMember.set(badge.userId, held);
  }
  const holders = rarity && holdersOf(rarity);

  return {
    items: filtered.map((m) => {
      const social = presentMemberSocials({
        userId: m.profile.userId,
        identities: identitiesByUser.get(m.profile.userId) ?? [],
        hasGithubAccount: githubAccountIds.has(m.profile.userId),
        pasted: {
          githubUrl: m.profile.githubUrl,
          linkedinUrl: m.profile.linkedinUrl,
          websiteUrl: m.profile.websiteUrl,
        },
        subject: "member",
      });
      const entry = toPublicRosterEntry({
        profile: m.profile,
        email: input.view ? null : m.email,
        image: m.image,
        ownedActiveAgentId: m.agentId,
        badgeCount: heldByMember.get(m.profile.userId)?.length ?? 0,
        topBadges: featuredBadges(
          heldByMember.get(m.profile.userId) ?? [],
          holders,
          ROSTER_BADGE_LIMIT,
        ),
        social: toLeaderboardSocial(social),
      });
      return input.view
        ? {
            ...entry,
            headline: memberHeadline(m.profile.company, m.bio),
            joinedAt: m.joinedAt,
            community: rosterCommunities?.get(m.profile.userId),
          }
        : entry;
    }),
    nextCursor: hasMore ? input.cursor + input.limit : null,
  };
}
