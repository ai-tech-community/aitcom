// @vitest-environment node
/**
 * DB-INTEGRATION test: the badge backfill core (`runBadgeBackfill`), the
 * function behind scripts/backfill-badges.ts.
 *
 * - Dry run reports per-track tiers and off-catalog rows and writes nothing.
 * - Apply records the tiers silently (no XP, notification or event), moves
 *   matched prize rows to member_award with their date, keeps the rest.
 * - A re-run writes nothing.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/badges/backfill.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

const RICH_TEXT = {
  root: {
    type: "root",
    direction: "ltr" as const,
    format: "" as const,
    indent: 0,
    version: 1,
    children: [
      {
        type: "paragraph",
        version: 1,
        children: [{ type: "text", text: "badge backfill integration test" }],
      },
    ],
  },
};

describe.skipIf(!RUN_DB)("badge backfill [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    drizzle: typeof import("drizzle-orm");
    backfill: typeof import("@/server/badges/backfill");
    getPayloadClient: typeof import("@/server/payload").getPayloadClient;
  };
  let m: Mods;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const u = {
    /** Attended three events, holds none of the Regular tiers. */
    regular: `bf-regular-${suffix}`,
    /** Holds Regular I already; attended one event. */
    holder: `bf-holder-${suffix}`,
    /** Holds a prize row that matches a challenge they joined. */
    winner: `bf-winner-${suffix}`,
    /** Holds prize text of no challenge they joined, and a removed slug. */
    stray: `bf-stray-${suffix}`,
  };
  const ids = Object.values(u);
  const prize = `BF prize ${suffix}`;
  const lost = `BF lost prize ${suffix}`;
  const winnerEarnedAt = new Date("2026-03-01T10:00:00Z");
  let challengeId = 0;
  const run = (apply: boolean) =>
    m.backfill.runBadgeBackfill(
      { db: m.db, payload: m.getPayloadClient },
      { apply, batchSize: 2, userIds: ids },
    );

  const rows = {
    badges: () =>
      m.db
        .select({
          userId: m.schema.memberBadges.userId,
          slug: m.schema.memberBadges.badgeSlug,
        })
        .from(m.schema.memberBadges)
        .where(m.drizzle.inArray(m.schema.memberBadges.userId, ids)),
    awards: () =>
      m.db
        .select({
          userId: m.schema.memberAwards.userId,
          challengeId: m.schema.memberAwards.challengeId,
          label: m.schema.memberAwards.label,
          earnedAt: m.schema.memberAwards.earnedAt,
        })
        .from(m.schema.memberAwards)
        .where(m.drizzle.inArray(m.schema.memberAwards.userId, ids)),
    notices: () =>
      m.db
        .select({ id: m.schema.notifications.id })
        .from(m.schema.notifications)
        .where(m.drizzle.inArray(m.schema.notifications.userId, ids)),
    points: () =>
      m.db
        .select({ id: m.schema.pointsEvents.id })
        .from(m.schema.pointsEvents)
        .where(m.drizzle.inArray(m.schema.pointsEvents.userId, ids)),
  };

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [{ db }, schema, drizzle, backfill, { getPayloadClient }] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("drizzle-orm"),
        import("@/server/badges/backfill"),
        import("@/server/payload"),
      ]);
    m = { db, schema, drizzle, backfill, getPayloadClient };

    await db
      .insert(schema.user)
      .values(ids.map((id) => ({ id, email: `${id}@aitcom.test`, name: id })));
    await db
      .insert(schema.memberProfiles)
      .values(ids.map((id) => ({ userId: id, displayName: id })));

    const payload = await getPayloadClient();
    const challenge = (await payload.create({
      collection: "challenges",
      data: {
        title: `BF challenge ${suffix}`,
        slug: `bf-challenge-${suffix}`,
        description: RICH_TEXT,
        type: "open-ended",
        status: "draft",
        difficulty: "beginner",
        publishedBy: "member",
        creatorId: u.stray,
        startsAt: new Date().toISOString(),
        endsAt: new Date().toISOString(),
        objectives: [
          { description: "Build it", verification: "test", targetCount: 1 },
        ],
        rewards: { xpReward: 0, badgeReward: prize },
        maxParticipants: 0,
        proposedBy: u.stray,
      } as never,
    })) as unknown as { id: number };
    challengeId = challenge.id;

    await db.insert(schema.eventRegistrations).values([
      ...[1, 2, 3].map((n) => ({
        eventId: 910_000 + n,
        userId: u.regular,
        status: "attended" as const,
      })),
      { eventId: 910_010, userId: u.holder, status: "attended" as const },
    ]);
    await db.insert(schema.challengeEnrollments).values({
      challengeId,
      userId: u.winner,
    });
    await db.insert(schema.memberBadges).values([
      { userId: u.holder, badgeSlug: "first_event" },
      { userId: u.winner, badgeSlug: prize, earnedAt: winnerEarnedAt },
      // The prize text exists, but this member never joined that challenge.
      { userId: u.stray, badgeSlug: prize },
      { userId: u.stray, badgeSlug: lost },
      // Removed from the catalog (never awardable).
      { userId: u.stray, badgeSlug: "speaker" },
    ]);
  }, 120_000);

  afterAll(async () => {
    if (!m) return;
    const { db, schema } = m;
    const { inArray } = m.drizzle;
    try {
      const payload = await m.getPayloadClient();
      if (challengeId) {
        await payload.delete({ collection: "challenges", id: challengeId });
      }
    } catch {
      // Best-effort teardown.
    }
    for (const [table, column] of [
      [schema.challengeEnrollments, schema.challengeEnrollments.userId],
      [schema.eventRegistrations, schema.eventRegistrations.userId],
      [schema.notifications, schema.notifications.userId],
      [schema.pointsEvents, schema.pointsEvents.userId],
      [schema.memberBadges, schema.memberBadges.userId],
      [schema.memberAwards, schema.memberAwards.userId],
      [schema.activityEvents, schema.activityEvents.actorId],
    ] as const) {
      await db.delete(table).where(inArray(column, ids));
    }
    await db
      .delete(schema.memberProfiles)
      .where(inArray(schema.memberProfiles.userId, ids));
    await db.delete(schema.user).where(inArray(schema.user.id, ids));
  }, 120_000);

  it("dry run reports what apply would write, and writes nothing", async () => {
    const badgesBefore = await rows.badges();
    const report = await run(false);

    expect(report.apply).toBe(false);
    expect(report.members).toBe(ids.length);
    expect(report.failedMembers).toEqual([]);
    expect(report.newTiers.regular).toEqual({ first_event: 1, regular: 1 });
    expect(report.newTiers.writer).toEqual({});
    expect(report.offCatalog).toEqual(
      [
        {
          slug: prize,
          holders: 2,
          awards: { matched: 1, ambiguous: 0, unmatched: 1 },
        },
        {
          slug: lost,
          holders: 1,
          awards: { matched: 0, ambiguous: 0, unmatched: 1 },
        },
        {
          slug: "speaker",
          holders: 1,
          awards: { matched: 0, ambiguous: 0, unmatched: 1 },
        },
      ].sort((a, b) => a.slug.localeCompare(b.slug)),
    );
    expect(report.inserted).toBe(0);
    expect(report.awardsMoved).toBe(0);

    expect(await rows.badges()).toEqual(badgesBefore);
    expect(await rows.awards()).toEqual([]);

    const text = m.backfill.formatBackfillReport(report).join("\n");
    expect(text).toContain("dry run");
    expect(text).toContain("regular: first_event 1, regular 1");
  });

  it("apply writes tiers silently, moves matched prizes, keeps the rest", async () => {
    const report = await run(true);
    expect(report.inserted).toBe(2);
    expect(report.awardsMoved).toBe(1);

    const who = new Map(Object.entries(u).map(([name, id]) => [id, name]));
    const badges = (await rows.badges())
      .map((row) => `${who.get(row.userId)}:${row.slug}`)
      .sort();
    expect(badges).toEqual(
      [
        "regular:first_event",
        "regular:regular",
        "holder:first_event",
        `stray:${prize}`,
        `stray:${lost}`,
        "stray:speaker",
      ].sort(),
    );
    expect(await rows.awards()).toEqual([
      {
        userId: u.winner,
        challengeId,
        label: prize,
        earnedAt: winnerEarnedAt,
      },
    ]);
    // Retroactive: no notifications and no XP.
    expect(await rows.notices()).toEqual([]);
    expect(await rows.points()).toEqual([]);
  });

  it("a re-run writes nothing", async () => {
    const badgesBefore = await rows.badges();
    const awardsBefore = await rows.awards();
    const report = await run(true);
    expect(report.inserted).toBe(0);
    expect(report.awardsMoved).toBe(0);
    expect(report.newTiers.regular).toEqual({});
    expect(await rows.badges()).toEqual(badgesBefore);
    expect(await rows.awards()).toEqual(awardsBefore);
  });
});
