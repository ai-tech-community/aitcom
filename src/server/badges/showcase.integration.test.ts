// @vitest-environment node
/**
 * DB-INTEGRATION test: the owner's badge procedures (ADR-0039, slice 4).
 *
 * - `badges.myProgress` returns the caller's own track metrics, equal to
 *   the engine's metric functions, and nobody else's.
 * - `badges.pin` / `badges.unpin` only accept badges the caller holds that
 *   are in the catalog, cap the showcase at three, and the profile's
 *   showcase follows the pins.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/badges/showcase.integration.test.ts
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

describe.skipIf(!RUN_DB)(
  "badge progress and showcase pins [DB integration]",
  () => {
    type Mods = {
      db: typeof import("@/server/db").db;
      schema: typeof import("@/server/db/schema");
      drizzle: typeof import("drizzle-orm");
      metrics: typeof import("@/server/badges/metrics");
      catalog: typeof import("@/lib/badges/catalog");
      rarity: typeof import("@/server/badges/rarity");
      engine: typeof import("@/server/badges/engine");
      showcase: typeof import("@/lib/badges/showcase");
      createCaller: typeof import("@/server/api/root").createCaller;
      getPayloadClient: typeof import("@/server/payload").getPayloadClient;
    };
    let m: Mods;
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const owner = `bs-owner-${suffix}`;
    const other = `bs-other-${suffix}`;
    const noProfile = `bs-noprof-${suffix}`;
    const users = [owner, other, noProfile];
    const courseBase = 900_000_000 + Math.floor(Math.random() * 1e6);

    beforeAll(async () => {
      if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
        throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
      }
      const [
        dbMod,
        schema,
        drizzle,
        metrics,
        catalog,
        rarity,
        root,
        payload,
        engine,
        showcase,
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("drizzle-orm"),
        import("@/server/badges/metrics"),
        import("@/lib/badges/catalog"),
        import("@/server/badges/rarity"),
        import("@/server/api/root"),
        import("@/server/payload"),
        import("@/server/badges/engine"),
        import("@/lib/badges/showcase"),
      ]);
      m = {
        db: dbMod.db,
        schema,
        drizzle,
        metrics,
        catalog,
        rarity,
        createCaller: root.createCaller,
        getPayloadClient: payload.getPayloadClient,
        engine,
        showcase,
      };
      const { db } = m;
      await db
        .insert(schema.user)
        .values(
          users.map((id) => ({ id, email: `${id}@example.test`, name: id })),
        );
      await db.insert(schema.memberProfiles).values([
        { userId: owner, displayName: `Owner ${suffix}` },
        { userId: other, displayName: "Other" },
      ]);
      // Learner metric: the other member completed four courses, the owner one.
      await db.insert(schema.courseCertificates).values([
        { userId: owner, courseId: courseBase },
        ...[1, 2, 3, 4].map((i) => ({
          userId: other,
          courseId: courseBase + i,
        })),
      ]);
      await db.insert(schema.memberBadges).values(
        [
          "first_event",
          "regular",
          "course_complete",
          "profile_complete",
          "early_adopter",
          // Stored but not in the catalog: never pinnable.
          "speaker",
        ].map((badgeSlug, i) => ({
          userId: owner,
          badgeSlug,
          // A day apart, so "newest first" is unambiguous.
          earnedAt: new Date(Date.UTC(2026, 0, 1 + i)),
        })),
      );
      await db
        .insert(schema.memberBadges)
        .values({ userId: other, badgeSlug: "veteran" });
    }, 120_000);

    afterAll(async () => {
      if (!m) return;
      const { db, schema, drizzle } = m;
      await db
        .delete(schema.activityEvents)
        .where(drizzle.inArray(schema.activityEvents.actorId, users));
      await db
        .delete(schema.notifications)
        .where(drizzle.inArray(schema.notifications.userId, users));
      await db
        .delete(schema.pointsEvents)
        .where(drizzle.inArray(schema.pointsEvents.userId, users));
      await db
        .delete(schema.memberBadges)
        .where(drizzle.inArray(schema.memberBadges.userId, users));
      await db
        .delete(schema.courseCertificates)
        .where(drizzle.inArray(schema.courseCertificates.userId, users));
      await db
        .delete(schema.memberProfiles)
        .where(drizzle.inArray(schema.memberProfiles.userId, users));
      await db
        .delete(schema.user)
        .where(drizzle.inArray(schema.user.id, users));
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

    it("myProgress returns the caller's own metrics, equal to the engine's", async () => {
      const progress = await as(owner).badges.myProgress();
      expect(progress.map((p) => p.track)).toEqual(m.catalog.BADGE_TRACK_IDS);

      const sources = { db: m.db, payload: m.getPayloadClient };
      for (const entry of progress) {
        const engine = await m.metrics.TRACK_METRICS[entry.track](
          sources,
          owner,
        );
        expect(entry.current, entry.track).toBe(engine);
      }
      const learner = progress.find((p) => p.track === "learner")!;
      expect(learner).toEqual({ track: "learner", current: 1 });

      const theirs = await as(other).badges.myProgress();
      expect(theirs.find((p) => p.track === "learner")?.current).toBe(4);
    });

    it("myProgress is for signed-in members only", async () => {
      await expect(as(null).badges.myProgress()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("pin refuses a badge the caller does not hold, or one outside the catalog", async () => {
      // Held by the other member only.
      await expect(
        as(owner).badges.pin({ slug: "veteran" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      // Stored for the owner, but not displayable.
      await expect(
        as(owner).badges.pin({ slug: "speaker" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      // Without a profile there is no showcase.
      await expect(
        as(noProfile).badges.pin({ slug: "regular" }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });

    it("the first pin keeps the showcase the profile showed, new badge first", async () => {
      const before = await as(null).members.getPublicProfile({
        userId: owner,
      });
      expect(before?.showcase.source).toBe("rarest");
      expect(before?.showcase.slugs).toHaveLength(3);

      await as(owner).badges.pin({ slug: "profile_complete" });
      const [row] = await m.db
        .select({ pins: m.schema.memberProfiles.showcaseBadges })
        .from(m.schema.memberProfiles)
        .where(m.drizzle.eq(m.schema.memberProfiles.userId, owner));
      expect(row?.pins).toEqual(
        [
          "profile_complete",
          ...before!.showcase.slugs.filter((s) => s !== "profile_complete"),
        ].slice(0, 3),
      );
      const after = await as(null).members.getPublicProfile({ userId: owner });
      expect(after?.showcase.source).toBe("pinned");
      expect(after?.showcase.slugs).toHaveLength(3);
      expect(after?.showcase.slugs[0]).toBe("profile_complete");
    });

    it("pins up to three, refuses a fourth, and the profile shows the pins", async () => {
      const caller = as(owner);
      // Start from one pin, so the next pins add to it.
      await m.db
        .update(m.schema.memberProfiles)
        .set({ showcaseBadges: ["early_adopter"] })
        .where(m.drizzle.eq(m.schema.memberProfiles.userId, owner));
      await caller.badges.pin({ slug: "first_event" });
      const { pins } = await caller.badges.pin({ slug: "course_complete" });
      // A pinned track shows its highest held tier.
      expect(pins).toEqual(["early_adopter", "regular", "course_complete"]);

      await expect(
        caller.badges.pin({ slug: "profile_complete" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      const [row] = await m.db
        .select({ pins: m.schema.memberProfiles.showcaseBadges })
        .from(m.schema.memberProfiles)
        .where(m.drizzle.eq(m.schema.memberProfiles.userId, owner));
      expect(row?.pins).toEqual([
        "early_adopter",
        "first_event",
        "course_complete",
      ]);

      const profile = await as(null).members.getPublicProfile({
        userId: owner,
      });
      expect(profile?.showcase).toEqual({
        slugs: ["early_adopter", "regular", "course_complete"],
        source: "pinned",
      });
    });

    it("the database refuses a fourth pin even past the procedure", async () => {
      await expect(
        m.db
          .update(m.schema.memberProfiles)
          .set({ showcaseBadges: ["a", "b", "c", "d"] })
          .where(m.drizzle.eq(m.schema.memberProfiles.userId, owner)),
      ).rejects.toThrow();
    });

    it("unpins by any tier of a track, then falls back to the rarest", async () => {
      const caller = as(owner);
      expect((await caller.badges.unpin({ slug: "regular" })).pins).toEqual([
        "early_adopter",
        "course_complete",
      ]);
      await caller.badges.unpin({ slug: "early_adopter" });
      await caller.badges.unpin({ slug: "course_complete" });

      m.rarity.clearBadgeRarityCache();
      const profile = await as(null).members.getPublicProfile({
        userId: owner,
      });
      expect(profile?.showcase.source).toBe("rarest");
      expect(profile?.showcase.slugs).toHaveLength(3);
      expect(profile?.showcase.slugs).not.toContain("first_event");
    });
    it("orders the roster's emblems deterministically", async () => {
      const { rarity, showcase } = m;
      const caller = as(null);
      // One cached report for every call below, as on a server instance.
      const report = await rarity.getBadgeRarity(m.db);
      const tops = [];
      for (let i = 0; i < 3; i++) {
        const { items } = await caller.members.listMembers({
          search: suffix,
          limit: 50,
        });
        tops.push(
          items.find((item) => item.profile.userId === owner)?.topBadges,
        );
      }
      // Held newest first (the query's order), then ranked by rarity.
      const expected = showcase.featuredBadges(
        [
          "early_adopter",
          "profile_complete",
          "course_complete",
          "regular",
          "first_event",
        ],
        rarity.holdersOf(report),
        3,
      );
      expect(expected).toHaveLength(3);
      expect(tops).toEqual([expected, expected, expected]);
    });

    it("a newly earned badge drops the cached rarity; nothing earned keeps it", async () => {
      const { rarity, engine } = m;
      rarity.clearBadgeRarityCache();
      const first = rarity.getBadgeRarity(m.db);
      await first;
      expect(rarity.getBadgeRarity(m.db)).toBe(first);

      expect(
        await engine.awardMilestone(m.db, owner, "onboarding_complete"),
      ).toBe(true);
      const fresh = rarity.getBadgeRarity(m.db);
      expect(fresh).not.toBe(first);
      expect(
        (await fresh).badges.find((b) => b.slug === "onboarding_complete")!
          .holders,
      ).toBeGreaterThanOrEqual(1);

      // Already held: no new row, so the cached report stays.
      expect(
        await engine.awardMilestone(m.db, owner, "onboarding_complete"),
      ).toBe(false);
      expect(rarity.getBadgeRarity(m.db)).toBe(fresh);
    });
  },
);
