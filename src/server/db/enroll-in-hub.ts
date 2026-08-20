import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";

import { HUB_SLUG } from "@/server/communities/hub";
import type { db as _db } from "@/server/db";
import { communities, communityMemberships, user } from "@/server/db/schema";

type DB = typeof _db;

async function findHub(db: DB): Promise<{ id: string } | undefined> {
  return db.query.communities.findFirst({
    where: and(eq(communities.slug, HUB_SLUG), isNull(communities.deletedAt)),
    columns: { id: true },
  });
}

/**
 * Idempotently enrol a user into the root Hub community (`ait`) as a plain
 * member. Safe to call repeatedly: the (community_id, user_id) unique index
 * makes the insert a no-op on conflict. Returns false if the Hub row does
 * not exist yet (e.g. before seeding). See ADR-0019.
 *
 * Does **not** emit `community.joined` — `ait` is an anchor, and that event
 * would pollute discovery liveness. Signup already records `member.joined`.
 */
export async function enrollInHub(db: DB, userId: string): Promise<boolean> {
  const hub = await findHub(db);
  if (!hub) return false;

  await db
    .insert(communityMemberships)
    .values({
      communityId: hub.id,
      userId,
      role: "member",
      status: "active",
    })
    .onConflictDoNothing();
  return true;
}

/**
 * Enrol every existing user who lacks a Hub (`ait`) membership. Idempotent:
 * a second run inserts nothing. Privileged roles on `ait` are left alone
 * here — see `reclassifyAitAsAnchor`.
 */
export async function backfillHubEnrollment(
  db: DB,
): Promise<{ enrolled: number }> {
  const hub = await findHub(db);
  if (!hub) {
    throw new Error(
      "Hub community (slug 'ait') not found. Run seed-ait-community.ts first.",
    );
  }

  const alreadyRows = await db
    .select({ userId: communityMemberships.userId })
    .from(communityMemberships)
    .where(eq(communityMemberships.communityId, hub.id));
  const already = alreadyRows.map((r) => r.userId);

  const missing = await db
    .select({ id: user.id })
    .from(user)
    .where(already.length > 0 ? notInArray(user.id, already) : sql`true`);

  if (missing.length === 0) {
    return { enrolled: 0 };
  }

  const inserted = await db
    .insert(communityMemberships)
    .values(
      missing.map((u) => ({
        communityId: hub.id,
        userId: u.id,
        role: "member" as const,
        status: "active" as const,
      })),
    )
    .onConflictDoNothing()
    .returning({ userId: communityMemberships.userId });

  return { enrolled: inserted.length };
}

/**
 * Treat the root Hub as an anchor, not a tenant (ADR-0019): unlist it and
 * demote any owner/admin/moderator on `ait` to plain member. Does **not**
 * invent a Hub-operator role — that stays epic #85.
 */
export async function reclassifyAitAsAnchor(
  db: DB,
): Promise<{ unlisted: boolean; demoted: number }> {
  const hub = await findHub(db);
  if (!hub) {
    throw new Error(
      "Hub community (slug 'ait') not found. Run seed-ait-community.ts first.",
    );
  }

  await db
    .update(communities)
    .set({ isListedInDirectory: false })
    .where(eq(communities.id, hub.id));

  const demoted = await db
    .update(communityMemberships)
    .set({ role: "member" })
    .where(
      and(
        eq(communityMemberships.communityId, hub.id),
        inArray(communityMemberships.role, ["owner", "admin", "moderator"]),
      ),
    )
    .returning({ userId: communityMemberships.userId });

  return { unlisted: true, demoted: demoted.length };
}
