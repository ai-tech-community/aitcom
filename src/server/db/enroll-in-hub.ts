import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";

import { HUB_DESCRIPTION, HUB_NAME, HUB_SLUG } from "@/server/communities/hub";
import type { db as _db } from "@/server/db";
import { communities, communityMemberships, user } from "@/server/db/schema";

type DB = typeof _db;

async function findHub(db: DB): Promise<{ id: string } | undefined> {
  return db.query.communities.findFirst({
    where: and(eq(communities.slug, HUB_SLUG), isNull(communities.deletedAt)),
    columns: { id: true },
  });
}

async function findHubRow(
  db: DB,
): Promise<{ id: string; deletedAt: Date | null } | undefined> {
  return db.query.communities.findFirst({
    where: eq(communities.slug, HUB_SLUG),
    columns: { id: true, deletedAt: true },
  });
}

async function firstUserId(db: DB): Promise<string | undefined> {
  const [row] = await db.select({ id: user.id }).from(user).limit(1);
  return row?.id;
}

/**
 * Idempotently ensure the root Hub community (`ait`) exists. Production after
 * #239 could have enrolment self-heal with no `ait` row (never seeded, or
 * deleted). Restores a soft-deleted row; otherwise inserts the unlisted
 * ADR-0019 anchor. `createdBy` is a required FK only — the creator is a
 * plain member, not an organizer. See seed-ait-community.ts.
 */
export async function ensureHub(
  db: DB,
  createdBy?: string,
): Promise<{ id: string }> {
  const existing = await findHubRow(db);
  if (existing) {
    if (existing.deletedAt) {
      await db
        .update(communities)
        .set({ deletedAt: null, isListedInDirectory: false })
        .where(eq(communities.id, existing.id));
    }
    return { id: existing.id };
  }

  const ownerId = createdBy ?? (await firstUserId(db));
  if (!ownerId) {
    throw new Error(
      "Hub community (slug 'ait') could not be created: no users exist.",
    );
  }

  const [created] = await db
    .insert(communities)
    .values({
      name: HUB_NAME,
      slug: HUB_SLUG,
      description: HUB_DESCRIPTION,
      joinPolicy: "open",
      isListedInDirectory: false,
      createdBy: ownerId,
    })
    .onConflictDoNothing()
    .returning({ id: communities.id });

  if (created) return created;

  const raced = await findHubRow(db);
  if (!raced) {
    throw new Error("Hub community (slug 'ait') could not be created.");
  }
  return { id: raced.id };
}

/**
 * Idempotently enrol a user into the root Hub community (`ait`) as a plain
 * member. Creates the Hub row if it is missing so a first dashboard load is
 * enough after deploy. Safe to call repeatedly: the (community_id, user_id)
 * unique index makes the membership insert a no-op on conflict. See ADR-0019.
 *
 * Does **not** emit `community.joined` — `ait` is an anchor, and that event
 * would pollute discovery liveness. Signup already records `member.joined`.
 */
export async function enrollInHub(db: DB, userId: string): Promise<boolean> {
  const hub = await ensureHub(db, userId);

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
 * a second run inserts nothing. Creates the Hub row if it is missing.
 * Privileged roles on `ait` are left alone here — see `reclassifyAitAsAnchor`.
 */
export async function backfillHubEnrollment(
  db: DB,
): Promise<{ enrolled: number }> {
  const existing = await findHub(db);
  const hub = existing ?? (await ensureHub(db));

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
