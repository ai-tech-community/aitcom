/** Loads discovery candidates with windowed liveness signals. Thin DB glue. */

import { and, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";

import {
  communities,
  communityMemberships,
  activityEvents,
  communityAcquireConfig,
} from "@/server/db/schema";
import {
  CONTRIBUTION_ACTIONS,
  summarizeHealth,
  windowStart,
  type ActivityRow,
} from "@/server/communities/insights";
import { isPublicDirectoryCommunity } from "@/server/communities/content-visibility";
import type { CommunityCandidate } from "@/server/communities/discovery";
import type { db as _db } from "@/server/db";
import { HUB_SLUG } from "./hub";

type DB = typeof _db;

export const DISCOVERY_WINDOW_DAYS = 14;
export const PUBLIC_LIVENESS_WINDOW_DAYS = 7;
const CONTRIBUTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];

/** Shared public signals; browsing can include the Hub, recommendations cannot. */
async function loadCommunityCandidates(
  db: DB,
  now: Date,
  opts: { crossPromoteOnly?: boolean; includeHub: boolean },
): Promise<CommunityCandidate[]> {
  // The browse exception never changes the stored listing/roster privacy flag.
  const rows = await db
    .select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      description: communities.description,
      logoUrl: communities.logoUrl,
      isListedInDirectory: communities.isListedInDirectory,
      crossPromote: communityAcquireConfig.crossPromote,
    })
    .from(communities)
    .leftJoin(
      communityAcquireConfig,
      eq(communityAcquireConfig.communityId, communities.id),
    )
    .where(
      and(
        opts.includeHub
          ? or(
              eq(communities.isListedInDirectory, true),
              eq(communities.slug, HUB_SLUG),
            )
          : and(
              eq(communities.isListedInDirectory, true),
              ne(communities.slug, HUB_SLUG),
            ),
        isNull(communities.deletedAt),
      ),
    );

  const eligible = rows.filter(
    (r) =>
      isPublicDirectoryCommunity(r) &&
      (opts.includeHub || r.slug !== HUB_SLUG) &&
      (opts.crossPromoteOnly ? (r.crossPromote ?? true) : true),
  );
  if (eligible.length === 0) return [];
  const ids = eligible.map((r) => r.id);

  const since = windowStart(now, DISCOVERY_WINDOW_DAYS * 2);

  // Member counts (active) per community.
  const memberCounts = await db
    .select({
      communityId: communityMemberships.communityId,
      n: sql<number>`count(*)::int`,
    })
    .from(communityMemberships)
    .where(
      and(
        inArray(communityMemberships.communityId, ids),
        eq(communityMemberships.status, "active"),
      ),
    )
    .groupBy(communityMemberships.communityId);
  const memberCountMap = new Map(memberCounts.map((m) => [m.communityId, m.n]));

  // Contribution + join events across both windows (raw rows → summarizeHealth).
  const events = await db
    .select({
      communityId: activityEvents.communityId,
      actorId: activityEvents.actorId,
      action: activityEvents.action,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(
      and(
        inArray(activityEvents.communityId, ids),
        gte(activityEvents.createdAt, since),
        inArray(activityEvents.action, [
          ...CONTRIBUTION_LIST,
          "community.joined",
        ]),
      ),
    );

  const contribByCommunity = new Map<string, ActivityRow[]>();
  const joinByCommunity = new Map<string, ActivityRow[]>();
  for (const e of events) {
    if (!e.communityId) continue;
    const row: ActivityRow = {
      actorId: e.actorId,
      action: e.action,
      createdAt: e.createdAt,
    };
    if (e.action === "community.joined") {
      const list = joinByCommunity.get(e.communityId) ?? [];
      list.push(row);
      joinByCommunity.set(e.communityId, list);
    } else {
      const list = contribByCommunity.get(e.communityId) ?? [];
      list.push(row);
      contribByCommunity.set(e.communityId, list);
    }
  }

  return eligible.map((r) => {
    const health = summarizeHealth({
      contributions: contribByCommunity.get(r.id) ?? [],
      joins: joinByCommunity.get(r.id) ?? [],
      departures: [],
      now,
      windowDays: DISCOVERY_WINDOW_DAYS,
    });
    return {
      communityId: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      logoUrl: r.logoUrl,
      memberCount: memberCountMap.get(r.id) ?? 0,
      activeNow: health.activeNow,
      contributionCount: health.contributionCount,
      contributionPrev: health.contributionPrev,
      newJoins: health.newJoins,
    };
  });
}

/** Listed tenant communities eligible for recommendations and cross-promotion. */
export function loadDiscoveryCandidates(
  db: DB,
  now: Date,
  opts: { crossPromoteOnly?: boolean } = {},
): Promise<CommunityCandidate[]> {
  return loadCommunityCandidates(db, now, { ...opts, includeHub: false });
}

/** Public browsing includes the existing AIT root alongside listed communities. */
export function loadDirectoryCandidates(
  db: DB,
  now: Date,
): Promise<CommunityCandidate[]> {
  return loadCommunityCandidates(db, now, { includeHub: true });
}

export type PublicLiveness = {
  activeContributors: number;
  recentThreads: number;
};

/** Public-safe liveness for a single community: distinct contributors + new
 *  threads over the discovery window. No private/insight data. */
export async function loadPublicLiveness(
  db: DB,
  communityId: string,
  now: Date,
): Promise<PublicLiveness> {
  const since = windowStart(now, PUBLIC_LIVENESS_WINDOW_DAYS);
  const rows = await db
    .select({
      actorId: activityEvents.actorId,
      action: activityEvents.action,
    })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.communityId, communityId),
        gte(activityEvents.createdAt, since),
        inArray(activityEvents.action, CONTRIBUTION_LIST),
      ),
    );
  const contributors = new Set(rows.map((r) => r.actorId));
  const recentThreads = rows.filter((r) => r.action === "thread.create").length;
  return { activeContributors: contributors.size, recentThreads };
}

/** The set of community ids the user is an active member of. */
export async function loadMemberCommunityIds(
  db: DB,
  userId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ communityId: communityMemberships.communityId })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.userId, userId),
        eq(communityMemberships.status, "active"),
      ),
    );
  return new Set(rows.map((r) => r.communityId));
}
