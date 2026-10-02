// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
  let db: typeof import("@/server/db").db;
  let schema: typeof import("@/server/db/schema");
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
