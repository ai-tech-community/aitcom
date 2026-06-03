/** Thin DB glue for the member stack. Fetches public, active face candidates
 *  (leadership-first) without an N+1 across the directory, and the active
 *  total. Policy (ordering/visibility/overflow) lives in ./member-stack. */

import { and, eq, inArray, sql } from "drizzle-orm";

import { communityMemberships, memberProfiles, user } from "@/server/db/schema";
import {
  selectStackFaces,
  MEMBER_STACK_MAX_FACES,
  type StackCandidate,
  type StackFace,
} from "@/server/communities/member-stack";
import type { CommunityRole } from "@/server/communities/role-utils";
import type { db as _db } from "@/server/db";

type DB = typeof _db;

/** SQL leadership rank mirroring ROLE_HIERARCHY (higher = more senior). */
const roleRankSql = sql<number>`(case ${communityMemberships.role}
  when 'owner' then 4
  when 'admin' then 3
  when 'moderator' then 2
  else 1 end)`;

/** Top public+active face candidates per community, grouped by communityId.
 *  One query for the whole page (no N+1). Returns leadership-first faces.
 *
 *  Access control is the CALLER's responsibility: this applies no
 *  directory-listing or membership check. Only pass community ids the viewer
 *  is allowed to see (e.g. the `list` query passes listed-only communities;
 *  `getMemberStack` gates unlisted communities before calling). Passing an
 *  unlisted community id here would expose its faces. */
export async function loadStackFacesForCommunities(
  db: DB,
  communityIds: string[],
): Promise<Map<string, StackFace[]>> {
  const result = new Map<string, StackFace[]>();
  if (communityIds.length === 0) return result;

  // Rank public active members within each community; keep the top N.
  const ranked = db
    .select({
      communityId: communityMemberships.communityId,
      userId: communityMemberships.userId,
      role: communityMemberships.role,
      displayName: memberProfiles.displayName,
      image: user.image,
      isPublic: memberProfiles.isPublic,
      joinedAt: communityMemberships.joinedAt,
      rnk: sql<number>`row_number() over (
        partition by ${communityMemberships.communityId}
        order by ${roleRankSql} desc, ${communityMemberships.joinedAt} asc,
                 ${communityMemberships.userId} asc
      )`.as("rnk"),
    })
    .from(communityMemberships)
    .innerJoin(user, eq(communityMemberships.userId, user.id))
    .innerJoin(
      memberProfiles,
      eq(communityMemberships.userId, memberProfiles.userId),
    )
    .where(
      and(
        inArray(communityMemberships.communityId, communityIds),
        eq(communityMemberships.status, "active"),
        eq(memberProfiles.isPublic, true),
      ),
    )
    .as("ranked");

  const rows = await db
    .select({
      communityId: ranked.communityId,
      userId: ranked.userId,
      role: ranked.role,
      displayName: ranked.displayName,
      image: ranked.image,
      isPublic: ranked.isPublic,
      joinedAt: ranked.joinedAt,
    })
    .from(ranked)
    .where(sql`${ranked.rnk} <= ${MEMBER_STACK_MAX_FACES}`);

  // Group, then run the tested policy so ordering/visibility is single-sourced.
  const byCommunity = new Map<string, StackCandidate[]>();
  for (const r of rows) {
    const list = byCommunity.get(r.communityId) ?? [];
    list.push({
      userId: r.userId,
      role: r.role as CommunityRole,
      displayName: r.displayName,
      image: r.image,
      isPublic: r.isPublic,
      joinedAt: r.joinedAt,
    });
    byCommunity.set(r.communityId, list);
  }
  for (const [communityId, candidates] of byCommunity) {
    result.set(communityId, selectStackFaces(candidates));
  }
  return result;
}

/** Faces for a single community (header use). Total is fetched by the caller
 *  (the procedure already has the active count). */
export async function loadStackFaces(
  db: DB,
  communityId: string,
): Promise<StackFace[]> {
  const map = await loadStackFacesForCommunities(db, [communityId]);
  return map.get(communityId) ?? [];
}
