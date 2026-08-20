import { and, desc, eq, isNull } from "drizzle-orm";

import { HUB_SLUG } from "@/server/communities/hub";
import type { db as _db } from "@/server/db";
import { enrollInHub } from "@/server/db/enroll-in-hub";
import { communities, communityMemberships } from "@/server/db/schema";

type DB = typeof _db;

export type MyCommunity = {
  communityId: string;
  role: "owner" | "admin" | "moderator" | "member";
  status: "active" | "pending_approval" | "invited" | "banned";
  joinedAt: Date;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  autonomyLevel: "off" | "suggest";
};

type Enroll = (db: DB, userId: string) => Promise<boolean>;

/**
 * Memberships for My Communities. Does **not** hide the unlisted Hub root —
 * `ait` is an anchor (ADR-0019), so a Hub-only member must still see it here
 * even though public `/communities` omits it.
 */
export async function queryMyCommunities(
  db: DB,
  userId: string,
): Promise<MyCommunity[]> {
  return db
    .select({
      communityId: communityMemberships.communityId,
      role: communityMemberships.role,
      status: communityMemberships.status,
      joinedAt: communityMemberships.joinedAt,
      name: communities.name,
      slug: communities.slug,
      description: communities.description,
      logoUrl: communities.logoUrl,
      autonomyLevel: communities.autonomyLevel,
    })
    .from(communityMemberships)
    .innerJoin(
      communities,
      and(
        eq(communityMemberships.communityId, communities.id),
        isNull(communities.deletedAt),
      ),
    )
    .where(eq(communityMemberships.userId, userId))
    .orderBy(desc(communityMemberships.joinedAt));
}

export function hasActiveHubMembership(rows: MyCommunity[]): boolean {
  return rows.some((m) => m.slug === HUB_SLUG && m.status === "active");
}

/**
 * My Communities list with Hub self-heal. Email+password signup can miss the
 * `user.create.after` insert (Better Auth may still be inside that
 * transaction, so a second Neon connection cannot see the new user row).
 * If the `ait` membership — or the Hub row itself — is missing, enrollInHub
 * creates the unlisted root and enrols so the dashboard is not empty.
 */
export async function listMyCommunities(
  db: DB,
  userId: string,
  enroll: Enroll = enrollInHub,
): Promise<MyCommunity[]> {
  const existing = await queryMyCommunities(db, userId);
  if (hasActiveHubMembership(existing)) return existing;

  try {
    await enroll(db, userId);
  } catch {
    return existing;
  }

  return queryMyCommunities(db, userId);
}
