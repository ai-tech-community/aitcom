/**
 * One cast of communities and people for the private-community gate tests
 * (ADR-0050): a public community (listed and open), a listed invite-only
 * one, a listed approval-required one and an unlisted one, with a member
 * of each, an owner, a member whose profile is private, someone waiting
 * for approval, someone invited, and an outsider.
 *
 * DB integration only: callers skip unless `RUN_DB_TESTS=1` points at a
 * local database.
 */

import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

export type CommunityFixtureRef = { id: string; slug: string };

export type PrivateCommunityFixture = {
  sfx: string;
  users: {
    owner: string;
    member: string;
    privateMember: string;
    pending: string;
    invited: string;
    outsider: string;
  };
  /** Listed and open: content and roster are public. */
  open: CommunityFixtureRef;
  inviteOnly: CommunityFixtureRef;
  approval: CommunityFixtureRef;
  unlisted: CommunityFixtureRef;
  /** The three members-only communities, labelled for `it.each`. */
  membersOnly: [label: string, community: CommunityFixtureRef][];
  /** Everyone who may not read a members-only community. */
  outsiders: (string | null)[];
  cleanup: () => Promise<void>;
};

/** Whether DB integration tests may run here: a local database only. */
export function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (/neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}

export async function createPrivateCommunityFixture(m: {
  db: typeof Db;
  schema: typeof Schema;
}): Promise<PrivateCommunityFixture> {
  const { db, schema } = m;
  const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const users = {
    owner: `pcg-owner-${sfx}`,
    member: `pcg-member-${sfx}`,
    privateMember: `pcg-private-${sfx}`,
    pending: `pcg-pending-${sfx}`,
    invited: `pcg-invited-${sfx}`,
    outsider: `pcg-outsider-${sfx}`,
  };
  await db.insert(schema.user).values(
    Object.entries(users).map(([name, id]) => ({
      id,
      email: `${id}@example.test`,
      name,
    })),
  );
  await db.insert(schema.memberProfiles).values([
    { userId: users.member, displayName: `Member ${sfx}`, xp: 120 },
    {
      userId: users.privateMember,
      displayName: `Private ${sfx}`,
      xp: 900,
      company: "Secret Co",
      isPublic: false,
    },
  ]);

  const rows = await db
    .insert(schema.communities)
    .values([
      {
        name: `Gate open ${sfx}`,
        slug: `gate-open-${sfx}`,
        createdBy: users.owner,
        isListedInDirectory: true,
        joinPolicy: "open" as const,
      },
      {
        name: `Gate invite ${sfx}`,
        slug: `gate-invite-${sfx}`,
        createdBy: users.owner,
        isListedInDirectory: true,
        joinPolicy: "invite_only" as const,
      },
      {
        name: `Gate approval ${sfx}`,
        slug: `gate-approval-${sfx}`,
        createdBy: users.owner,
        isListedInDirectory: true,
        joinPolicy: "approval_required" as const,
      },
      {
        name: `Gate unlisted ${sfx}`,
        slug: `gate-unlisted-${sfx}`,
        createdBy: users.owner,
        isListedInDirectory: false,
        joinPolicy: "open" as const,
      },
    ])
    .returning();
  const [open, inviteOnly, approval, unlisted] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
  })) as [
    CommunityFixtureRef,
    CommunityFixtureRef,
    CommunityFixtureRef,
    CommunityFixtureRef,
  ];
  const all = [open, inviteOnly, approval, unlisted];
  const membersOnly = [inviteOnly, approval, unlisted];

  await db.insert(schema.communityMemberships).values([
    ...all.flatMap((c) => [
      {
        communityId: c.id,
        userId: users.owner,
        role: "owner" as const,
        status: "active" as const,
      },
      { communityId: c.id, userId: users.member, status: "active" as const },
      {
        communityId: c.id,
        userId: users.privateMember,
        status: "active" as const,
      },
    ]),
    ...membersOnly.flatMap((c) => [
      {
        communityId: c.id,
        userId: users.pending,
        status: "pending_approval" as const,
      },
      { communityId: c.id, userId: users.invited, status: "invited" as const },
    ]),
  ]);

  async function cleanup() {
    const { eq, inArray } = await import("drizzle-orm");
    const ids = all.map((c) => c.id);
    const userIds = Object.values(users);
    await db
      .delete(schema.spaceMemberships)
      .where(inArray(schema.spaceMemberships.userId, userIds));
    await db
      .delete(schema.spaces)
      .where(inArray(schema.spaces.communityId, ids));
    await db
      .delete(schema.communityMemberships)
      .where(inArray(schema.communityMemberships.communityId, ids));
    await db
      .delete(schema.communities)
      .where(inArray(schema.communities.id, ids));
    await db
      .delete(schema.pointsEvents)
      .where(inArray(schema.pointsEvents.userId, userIds));
    await db
      .delete(schema.memberProfiles)
      .where(inArray(schema.memberProfiles.userId, userIds));
    for (const id of userIds) {
      await db.delete(schema.user).where(eq(schema.user.id, id));
    }
  }

  return {
    sfx,
    users,
    open,
    inviteOnly,
    approval,
    unlisted,
    membersOnly: [
      ["listed invite_only", inviteOnly],
      ["listed approval_required", approval],
      ["unlisted", unlisted],
    ],
    outsiders: [null, users.outsider, users.pending, users.invited],
    cleanup,
  };
}
