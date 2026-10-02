// @vitest-environment node
/**
 * DB-INTEGRATION test: the earning moment's procedures (ADR-0039, slice 5).
 *
 * - `badges.unseen` returns only the caller's unseen, displayable badges
 *   and awards that their live path celebrated (a `badge_earned` or
 *   `award_won` notification), oldest first, capped, with the rest as ids,
 *   and loads rarity only when there is something to celebrate.
 * - `badges.markSeen` marks only the caller's own rows; other members' ids
 *   are ignored.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/badges/earning-moment.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

describe.skipIf(!RUN_DB)("earning moment [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    drizzle: typeof import("drizzle-orm");
    createCaller: typeof import("@/server/api/root").createCaller;
    moment: typeof import("@/server/badges/earning-moment");
  };
  let m: Mods;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const owner = `em-owner-${suffix}`;
  const other = `em-other-${suffix}`;
  const noProfile = `em-noprof-${suffix}`;
  const users = [owner, other, noProfile];
  const day = (n: number) => new Date(Date.UTC(2026, 5, n, 12));
  const id = (name: string) => `${name}-${suffix}`;

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [dbMod, schema, drizzle, root, moment] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("drizzle-orm"),
      import("@/server/api/root"),
      import("@/server/badges/earning-moment"),
    ]);
    m = {
      db: dbMod.db,
      schema,
      drizzle,
      createCaller: root.createCaller,
      moment,
    };
    const { db } = m;
    await db
      .insert(schema.user)
      .values(
        users.map((u) => ({ id: u, email: `${u}@example.test`, name: u })),
      );
    await db.insert(schema.memberProfiles).values([
      {
        userId: owner,
        displayName: `Owner ${suffix}`,
        showcaseBadges: ["first_event"],
      },
      { userId: other, displayName: `Other ${suffix}`, isPublic: false },
    ]);
    await db.insert(schema.memberBadges).values([
      // Already seen: never shown again.
      {
        id: id("seen"),
        userId: owner,
        badgeSlug: "first_event",
        earnedAt: day(1),
        seenAt: day(1),
      },
      // Unseen, out of earning order on purpose.
      {
        id: id("regular"),
        userId: owner,
        badgeSlug: "regular",
        earnedAt: day(3),
      },
      {
        id: id("writer"),
        userId: owner,
        badgeSlug: "article_author",
        earnedAt: day(2),
      },
      {
        id: id("host"),
        userId: owner,
        badgeSlug: "host_1",
        earnedAt: day(6),
      },
      {
        id: id("builder"),
        userId: owner,
        badgeSlug: "first_launch",
        earnedAt: day(7),
      },
      // Unseen but silent (no notification, e.g. written by an older
      // deployment): never celebrated.
      {
        id: id("silent"),
        userId: owner,
        badgeSlug: "teacher_1",
        earnedAt: day(1),
      },
      // Stored but not in the catalog: never shown or celebrated.
      {
        id: id("offcatalog"),
        userId: owner,
        badgeSlug: "speaker",
        earnedAt: day(1),
      },
      // Another member's unseen badge.
      {
        id: id("theirs"),
        userId: other,
        badgeSlug: "veteran",
        earnedAt: day(1),
      },
      {
        id: id("noprof"),
        userId: noProfile,
        badgeSlug: "first_event",
        earnedAt: day(1),
      },
    ]);
    await db.insert(schema.memberAwards).values([
      {
        id: id("award"),
        userId: owner,
        challengeId: 1,
        label: `Winner ${suffix}`,
        earnedAt: day(4),
      },
      {
        id: id("their-award"),
        userId: other,
        challengeId: 1,
        label: `Winner ${suffix}`,
        earnedAt: day(1),
      },
      // Unseen but not from a live completion (no notification).
      {
        id: id("moved-award"),
        userId: owner,
        challengeId: 2,
        label: `Runner-up ${suffix}`,
        earnedAt: day(1),
      },
    ]);
    // The live paths' markers, as the engine and grantChallengeAward write.
    const badgeNotice = (userId: string, badgeSlug: string) => ({
      userId,
      type: "badge_earned",
      title: "You earned it",
      content: "",
      metadata: { badgeSlug },
    });
    await db.insert(schema.notifications).values([
      badgeNotice(owner, "first_event"),
      badgeNotice(owner, "regular"),
      badgeNotice(owner, "article_author"),
      badgeNotice(owner, "host_1"),
      badgeNotice(owner, "first_launch"),
      badgeNotice(owner, "speaker"),
      badgeNotice(other, "veteran"),
      badgeNotice(noProfile, "first_event"),
      ...[
        [owner, id("award")],
        [other, id("their-award")],
      ].map(([userId, awardId]) => ({
        userId: userId!,
        type: "award_won",
        title: "You won an award",
        content: "",
        metadata: { awardId },
      })),
    ]);
  }, 120_000);

  afterAll(async () => {
    if (!m) return;
    const { db, schema, drizzle } = m;
    await db
      .delete(schema.notifications)
      .where(drizzle.inArray(schema.notifications.userId, users));
    await db
      .delete(schema.memberAwards)
      .where(drizzle.inArray(schema.memberAwards.userId, users));
    await db
      .delete(schema.memberBadges)
      .where(drizzle.inArray(schema.memberBadges.userId, users));
    await db
      .delete(schema.memberProfiles)
      .where(drizzle.inArray(schema.memberProfiles.userId, users));
    await db.delete(schema.user).where(drizzle.inArray(schema.user.id, users));
  });

  function as(userId: string | null) {
    return m.createCaller({
      db: m.db,
      session: userId
        ? ({ user: { id: userId, name: userId } } as never)
        : null,
      headers: new Headers(),
    });
  }

  async function seenOf(ids: string[]) {
    const { db, schema, drizzle } = m;
    const badges = await db
      .select({
        id: schema.memberBadges.id,
        seenAt: schema.memberBadges.seenAt,
      })
      .from(schema.memberBadges)
      .where(drizzle.inArray(schema.memberBadges.id, ids));
    const awards = await db
      .select({
        id: schema.memberAwards.id,
        seenAt: schema.memberAwards.seenAt,
      })
      .from(schema.memberAwards)
      .where(drizzle.inArray(schema.memberAwards.id, ids));
    return Object.fromEntries(
      [...badges, ...awards].map((row) => [row.id, row.seenAt !== null]),
    );
  }

  it("unseen and markSeen are for signed-in members only", async () => {
    await expect(as(null).badges.unseen()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      as(null).badges.markSeen({ ids: [id("regular")] }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns the caller's unseen earnings, oldest first, capped, with their pins", async () => {
    const unseen = await as(owner).badges.unseen();
    expect(
      unseen.items.map((item) => [item.kind, item.id, item.earnedAt]),
    ).toEqual([
      ["badge", id("writer"), day(2).toISOString()],
      ["badge", id("regular"), day(3).toISOString()],
      ["award", id("award"), day(4).toISOString()],
    ]);
    expect(unseen.items[0]).toMatchObject({ slug: "article_author" });
    expect(unseen.items[2]).toEqual({
      kind: "award",
      id: id("award"),
      label: `Winner ${suffix}`,
      earnedAt: day(4).toISOString(),
    });
    expect(unseen.moreIds).toEqual([id("host"), id("builder")]);
    // Pinning Regular I pins the track, shown at its highest tier held.
    expect(unseen.profile).toEqual({
      pins: ["regular"],
      reach: { kind: "public" },
    });
  });

  it("never returns an unseen row its live path did not celebrate", async () => {
    const unseen = await as(owner).badges.unseen();
    const ids = [...unseen.items.map((item) => item.id), ...unseen.moreIds];
    expect(ids).not.toContain(id("silent"));
    expect(ids).not.toContain(id("moved-award"));
    expect(ids).not.toContain(id("offcatalog"));
  });

  it("tells a private profile apart, and has no profile for a member without one", async () => {
    expect((await as(other).badges.unseen()).profile).toEqual({
      pins: [],
      reach: { kind: "ownerOnly", reason: "private" },
    });
    const unseen = await as(noProfile).badges.unseen();
    expect(unseen.items.map((item) => item.id)).toEqual([id("noprof")]);
    expect(unseen.profile).toBeNull();
  });

  it("loads rarity only when there is a badge to celebrate", async () => {
    const empty = `em-empty-${suffix}`;
    const loadRarity = vi.fn(async () => null);
    expect(await m.moment.loadUnseenEarnings(m.db, empty, loadRarity)).toEqual(
      m.moment.NO_UNSEEN_EARNINGS,
    );
    expect(loadRarity).not.toHaveBeenCalled();

    await m.moment.loadUnseenEarnings(m.db, owner, loadRarity);
    expect(loadRarity).toHaveBeenCalledTimes(1);
  });

  it("markSeen marks only the caller's own rows and ignores other ids", async () => {
    const result = await as(owner).badges.markSeen({
      ids: [id("writer"), id("award"), id("theirs"), id("their-award")],
    });
    expect(result).toEqual({ marked: 2 });
    expect(
      await seenOf([
        id("writer"),
        id("award"),
        id("regular"),
        id("theirs"),
        id("their-award"),
      ]),
    ).toEqual({
      [id("writer")]: true,
      [id("award")]: true,
      [id("regular")]: false,
      [id("theirs")]: false,
      [id("their-award")]: false,
    });

    // Marking again changes nothing.
    expect(await as(owner).badges.markSeen({ ids: [id("writer")] })).toEqual({
      marked: 0,
    });

    const unseen = await as(owner).badges.unseen();
    expect(unseen.items.map((item) => item.id)).toEqual([
      id("regular"),
      id("host"),
      id("builder"),
    ]);
    expect(unseen.moreIds).toEqual([]);

    const theirs = await as(other).badges.unseen();
    // Same day: ordered by id.
    expect(theirs.items.map((item) => item.id)).toEqual([
      id("their-award"),
      id("theirs"),
    ]);
  });
});
