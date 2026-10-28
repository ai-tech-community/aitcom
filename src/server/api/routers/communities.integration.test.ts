// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { db as Database } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type { PayloadClient } from "@/server/magazines/deps";
import type { createCaller as CreateCaller } from "@/server/api/root";
import type { joinSourceCondition } from "@/server/communities/join-sources";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("communities discover [DB integration]", () => {
  let db: typeof Database;
  let schema: typeof Schema;
  const ids: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    [{ db }, schema] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
    ]);
  });

  beforeEach(async () => {
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const owner = `disc-owner-${sfx}`;
    userIds.push(owner);
    await db
      .insert(schema.user)
      .values({ id: owner, email: `${owner}@example.test`, name: "Owner" });
    // small community (1 member) and large community (3 members), both listed.
    const [small] = await db
      .insert(schema.communities)
      .values({
        name: `Small ${sfx}`,
        slug: `small-${sfx}`,
        createdBy: owner,
        isListedInDirectory: true,
      })
      .returning();
    const [large] = await db
      .insert(schema.communities)
      .values({
        name: `Large ${sfx}`,
        slug: `large-${sfx}`,
        createdBy: owner,
        isListedInDirectory: true,
      })
      .returning();
    ids.push(small!.id, large!.id);
    for (let i = 0; i < 1; i++) {
      const u = `m-s-${sfx}-${i}`;
      userIds.push(u);
      await db
        .insert(schema.user)
        .values({ id: u, email: `${u}@e.test`, name: u });
      await db.insert(schema.communityMemberships).values({
        communityId: small!.id,
        userId: u,
        status: "active",
        role: "member",
      });
    }
    for (let i = 0; i < 3; i++) {
      const u = `m-l-${sfx}-${i}`;
      userIds.push(u);
      await db
        .insert(schema.user)
        .values({ id: u, email: `${u}@e.test`, name: u });
      await db.insert(schema.communityMemberships).values({
        communityId: large!.id,
        userId: u,
        status: "active",
        role: "member",
      });
    }
  });

  afterEach(async () => {
    const { inArray } = await import("drizzle-orm");
    if (ids.length) {
      await db
        .delete(schema.communityMemberships)
        .where(inArray(schema.communityMemberships.communityId, ids));
      await db
        .delete(schema.communities)
        .where(inArray(schema.communities.id, ids));
    }
    if (userIds.length)
      await db.delete(schema.user).where(inArray(schema.user.id, userIds));
    ids.length = 0;
    userIds.length = 0;
  });

  it("sort=largest gets numeric active member counts from the directory query", async () => {
    // The 'largest' order itself is the pure comparator in directory.ts
    // (unit-tested in directory.test.ts); it compares memberCount with
    // subtraction, so the DB read must hand it real numbers.
    const { loadDiscoveryCandidates } =
      await import("@/server/communities/discovery-queries");
    const candidates = await loadDiscoveryCandidates(db, new Date());
    const [smallId, largeId] = ids;
    const small = candidates.find((c) => c.communityId === smallId);
    const large = candidates.find((c) => c.communityId === largeId);

    expect(small?.memberCount).toBe(1);
    expect(large?.memberCount).toBe(3);
  });

  it("livenessScore ranks a more-active community above a quiet one", async () => {
    const { livenessScore } = await import("@/server/communities/discovery");
    const quiet = {
      communityId: "q",
      slug: "q",
      name: "q",
      description: null,
      logoUrl: null,
      memberCount: 1,
      activeNow: 0,
      contributionCount: 0,
      contributionPrev: 0,
      newJoins: 0,
    };
    const lively = {
      ...quiet,
      communityId: "l",
      activeNow: 5,
      contributionCount: 10,
      contributionPrev: 2,
      newJoins: 3,
    };
    expect(livenessScore(lively)).toBeGreaterThan(livenessScore(quiet));
  });
});

// Real join callers pin the communities-owned metadata writer/reader seam.
describe.skipIf(!RUN_DB)("joins from magazine issues [DB integration]", () => {
  let db: typeof Database;
  let schema: typeof Schema;
  let payload: PayloadClient;
  let createCaller: typeof CreateCaller;
  let sourceCondition: typeof joinSourceCondition;
  let sfx: string;
  let owner: string;
  let reader: string;
  const communityIds: string[] = [];
  const magazineIds: number[] = [];

  beforeAll(async () => {
    const mods = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/payload"),
      import("@/server/api/root"),
      import("@/server/communities/join-sources"),
    ]);
    db = mods[0].db;
    schema = mods[1];
    payload = await mods[2].getPayloadClient();
    createCaller = mods[3].createCaller;
    sourceCondition = mods[4].joinSourceCondition;
  }, 120_000);

  beforeEach(async () => {
    sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    owner = `source-owner-${sfx}`;
    reader = `source-reader-${sfx}`;
    await db.insert(schema.user).values(
      [owner, reader].map((id) => ({
        id,
        email: `${id}@example.test`,
        name: id,
      })),
    );
    await db
      .insert(schema.memberProfiles)
      .values(
        [owner, reader].map((userId) => ({ userId, displayName: userId })),
      );
  });

  afterEach(async () => {
    const { inArray } = await import("drizzle-orm");
    if (magazineIds.length) {
      await db
        .delete(schema.magazineReads)
        .where(inArray(schema.magazineReads.magazineId, magazineIds));
      await db
        .delete(schema.magazineSubscriptions)
        .where(inArray(schema.magazineSubscriptions.magazineId, magazineIds));
      await payload.delete({
        collection: "magazine-issues",
        where: { magazine: { in: magazineIds } },
      });
      await payload.delete({
        collection: "magazines",
        where: { id: { in: magazineIds } },
      });
    }
    if (communityIds.length) {
      await db
        .delete(schema.activityEvents)
        .where(inArray(schema.activityEvents.communityId, communityIds));
      await db
        .delete(schema.spaces)
        .where(inArray(schema.spaces.communityId, communityIds));
      await db
        .delete(schema.communityMemberships)
        .where(inArray(schema.communityMemberships.communityId, communityIds));
      await db
        .delete(schema.communities)
        .where(inArray(schema.communities.id, communityIds));
    }
    await db
      .delete(schema.pointsEvents)
      .where(inArray(schema.pointsEvents.userId, [owner, reader]));
    await db
      .delete(schema.activityEvents)
      .where(inArray(schema.activityEvents.actorId, [owner, reader]));
    await db
      .delete(schema.notifications)
      .where(inArray(schema.notifications.userId, [owner, reader]));
    await db
      .delete(schema.memberBadges)
      .where(inArray(schema.memberBadges.userId, [owner, reader]));
    await db
      .delete(schema.memberProfiles)
      .where(inArray(schema.memberProfiles.userId, [owner, reader]));
    await db
      .delete(schema.user)
      .where(inArray(schema.user.id, [owner, reader]));
    communityIds.length = 0;
    magazineIds.length = 0;
  }, 60_000);

  function callerAs(userId = reader) {
    return createCaller({
      db,
      headers: new Headers(),
      session: { user: { id: userId, name: userId }, session: {} } as never,
    });
  }

  async function community(
    label: string,
    joinPolicy: "open" | "approval_required" = "open",
  ) {
    const [row] = await db
      .insert(schema.communities)
      .values({
        name: label,
        slug: `source-${label}-${sfx}`,
        createdBy: owner,
        isListedInDirectory: true,
        joinPolicy,
      })
      .returning();
    communityIds.push(row!.id);
    return row!;
  }

  async function issueIn(
    c: { id: string },
    label: string,
    status: "published" | "draft" = "published",
  ) {
    const magazine = await payload.create({
      collection: "magazines",
      data: {
        name: label,
        slug: `source-${label}-${sfx}`,
        communityId: c.id,
        createdBy: owner,
      },
    });
    magazineIds.push(Number(magazine.id));
    const issue = await payload.create({
      collection: "magazine-issues",
      data: {
        magazine: magazine.id,
        communityId: c.id,
        number: 1,
        title: label,
        slug: label,
        status,
        visibility: "teaser",
      },
    });
    return {
      via: "magazine",
      magazineId: Number(magazine.id),
      issueId: Number(issue.id),
    } as const;
  }

  async function event(c: { id: string }, action: string) {
    const { and, eq } = await import("drizzle-orm");
    return db.query.activityEvents.findFirst({
      where: and(
        eq(schema.activityEvents.communityId, c.id),
        eq(schema.activityEvents.actorId, reader),
        eq(schema.activityEvents.action, action),
      ),
    });
  }

  it("a join from a magazine records its source", async () => {
    const c = await community("join");
    const source = await issueIn(c, "join");
    await callerAs().communities.join({ slug: c.slug, source });
    expect((await event(c, "community.joined"))?.metadata).toEqual(source);
  });

  it("an ask to join records its source", async () => {
    const c = await community("request", "approval_required");
    const source = await issueIn(c, "request");
    await callerAs().communities.requestToJoin({ slug: c.slug, source });
    expect((await event(c, "community.join_requested"))?.metadata).toEqual(
      source,
    );
  });

  it("an invited member asking to join records the same request event", async () => {
    const c = await community("invited", "approval_required");
    const source = await issueIn(c, "invited");
    await db.insert(schema.communityMemberships).values({
      communityId: c.id,
      userId: reader,
      status: "invited",
      role: "member",
    });
    await callerAs().communities.requestToJoin({ slug: c.slug, source });
    expect((await event(c, "community.join_requested"))?.metadata).toEqual(
      source,
    );
  });

  it("a forged source is dropped and the join still works", async () => {
    const other = await community("other");
    const foreign = await issueIn(other, "foreign");
    for (const kind of [
      "foreign",
      "draft",
      "wrong-magazine",
      "missing",
    ] as const) {
      const c = await community(kind);
      const source =
        kind === "foreign"
          ? foreign
          : await issueIn(c, kind, kind === "draft" ? "draft" : "published");
      const forged =
        kind === "wrong-magazine"
          ? { ...source, magazineId: foreign.magazineId }
          : kind === "missing"
            ? { ...source, issueId: 2_147_483_647 }
            : source;
      expect(
        await callerAs().communities.join({ slug: c.slug, source: forged }),
      ).toEqual({ success: true });
      expect((await event(c, "community.joined"))?.metadata).not.toHaveProperty(
        "via",
      );
    }
  });

  it("a join without a source is unchanged", async () => {
    const c = await community("plain");
    expect(await callerAs().communities.join({ slug: c.slug })).toEqual({
      success: true,
    });
    expect((await event(c, "community.joined"))?.metadata).toEqual({});
  });

  it("the source condition finds what the metadata wrote", async () => {
    const c = await community("condition");
    const source = await issueIn(c, "condition");
    await callerAs().communities.join({ slug: c.slug, source });
    const { and, count, eq } = await import("drizzle-orm");
    const matches = async (issueId: number) =>
      db
        .select({ count: count() })
        .from(schema.activityEvents)
        .where(
          and(
            eq(schema.activityEvents.communityId, c.id),
            sourceCondition({ ...source, issueId }),
          ),
        );
    expect(await matches(source.issueId)).toEqual([{ count: 1 }]);
    expect(await matches(source.issueId + 1)).toEqual([{ count: 0 }]);
  });
});
