// @vitest-environment node
/**
 * DB-INTEGRATION test: the badge engine (ADR-0039).
 *
 * - Every track metric reads its source of truth.
 * - evaluateBadges is idempotent, records every tier reached at once, grants
 *   XP and a notification only for rows it actually created, and never
 *   breaks the caller's transaction.
 * - The hooks at the sources: event check-in (Regular, Host), article
 *   approval (Writer), challenge completion (Challenger + award).
 * - Rarity counts holders among members with a profile.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/badges/engine.integration.test.ts
 */
import { randomUUID } from "node:crypto";
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
        children: [{ type: "text", text: "badge engine integration test" }],
      },
    ],
  },
};

const DAY_MS = 86_400_000;

describe.skipIf(!RUN_DB)("badge engine [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    drizzle: typeof import("drizzle-orm");
    engine: typeof import("@/server/badges/engine");
    metrics: typeof import("@/server/badges/metrics");
    rarity: typeof import("@/server/badges/rarity");
    createCaller: typeof import("@/server/api/root").createCaller;
    getPayloadClient: typeof import("@/server/payload").getPayloadClient;
    checkEnrollmentCompletion: typeof import("@/server/agent/activity").checkEnrollmentCompletion;
    XP_AMOUNTS: typeof import("@/lib/gamification").XP_AMOUNTS;
  };
  let m: Mods;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const u = {
    /** Every metric's source rows. */
    metric: `be-metric-${suffix}`,
    /** Enrols in courses; gets referred. */
    other: `be-other-${suffix}`,
    /** evaluateBadges behaviour (idempotence, XP, notifications). */
    engine: `be-engine-${suffix}`,
    /** Event organizer for the check-in hook. */
    organizer: `be-org-${suffix}`,
    /** Attendee for the check-in hook. */
    attendee: `be-att-${suffix}`,
    /** Article author for the approval hook. */
    author: `be-author-${suffix}`,
    /** Challenge participant for the completion hook. */
    player: `be-player-${suffix}`,
    /** Jumps from 0 to 10 attended events in one evaluation. */
    jump: `be-jump-${suffix}`,
    /** Three attended events on a fresh member. */
    three: `be-three-${suffix}`,
    /** A 40-day streak long ago. */
    streaker: `be-streak-${suffix}`,
    /** A trusted author who publishes directly. */
    trusted: `be-trusted-${suffix}`,
  };
  const ids = Object.values(u);
  const payloadIds: { collection: string; id: number }[] = [];
  let communityId = "";
  const promptIds = [randomUUID(), randomUUID(), randomUUID()];

  async function create(
    collection: string,
    data: Record<string, unknown>,
    options: Record<string, unknown> = {},
  ): Promise<number> {
    const payload = await m.getPayloadClient();
    const doc = (await payload.create({
      collection: collection as never,
      data: data as never,
      ...options,
    })) as unknown as { id: number };
    payloadIds.push({ collection, id: doc.id });
    return doc.id;
  }

  function event(label: string, data: Record<string, unknown>) {
    return create(
      "events",
      {
        title: `BE event ${label} ${suffix}`,
        slug: `be-event-${label}-${suffix}`,
        description: RICH_TEXT,
        type: "meetup",
        status: "published",
        date: new Date(Date.now() - DAY_MS).toISOString(),
        startTime: "19:00",
        timezone: "Europe/Amsterdam",
        location: "Test Lab",
        communityId,
        ...data,
      },
      { context: { skipGeocode: true } },
    );
  }

  async function slugsOf(userId: string): Promise<string[]> {
    const rows = await m.db
      .select({ slug: m.schema.memberBadges.badgeSlug })
      .from(m.schema.memberBadges)
      .where(m.drizzle.eq(m.schema.memberBadges.userId, userId));
    return rows.map((row) => row.slug).sort();
  }

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [
      { db },
      schema,
      drizzle,
      engine,
      metrics,
      rarity,
      { createCaller },
      { getPayloadClient },
      { checkEnrollmentCompletion },
      { XP_AMOUNTS },
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("drizzle-orm"),
      import("@/server/badges/engine"),
      import("@/server/badges/metrics"),
      import("@/server/badges/rarity"),
      import("@/server/api/root"),
      import("@/server/payload"),
      import("@/server/agent/activity"),
      import("@/lib/gamification"),
    ]);
    m = {
      db,
      schema,
      drizzle,
      engine,
      metrics,
      rarity,
      createCaller,
      getPayloadClient,
      checkEnrollmentCompletion,
      XP_AMOUNTS,
    };

    await db
      .insert(schema.user)
      .values(ids.map((id) => ({ id, email: `${id}@aitcom.test`, name: id })));
    await db
      .insert(schema.memberProfiles)
      .values(
        ids.map((id) => ({ userId: id, displayName: id, isPublic: true })),
      );
    const [community] = await db
      .insert(schema.communities)
      .values({
        name: `BE community ${suffix}`,
        slug: `be-community-${suffix}`,
        createdBy: u.organizer,
        isListedInDirectory: false,
      })
      .returning({ id: schema.communities.id });
    communityId = community!.id;
    // The organizer sees their attendee list only as an active member.
    await db
      .insert(schema.communityMemberships)
      .values({ communityId, userId: u.organizer });
  }, 120_000);

  afterAll(async () => {
    if (!m) return;
    const { db, schema } = m;
    const { inArray } = m.drizzle;
    const payload = await m.getPayloadClient();
    for (const { collection, id } of payloadIds.reverse()) {
      try {
        await payload.delete({ collection: collection as never, id });
      } catch {
        // Best-effort teardown.
      }
    }
    await db.execute(m.drizzle.sql`
      DELETE FROM "app"."benchmark_run" WHERE submitted_by_user_id IN (${m.drizzle.sql.join(
        ids.map((id) => m.drizzle.sql`${id}`),
        m.drizzle.sql`, `,
      )})`);
    await db.execute(m.drizzle.sql`
      DELETE FROM "app"."agg_coverage_by_cell" WHERE prompt_id IN (${m.drizzle.sql.join(
        promptIds.map((id) => m.drizzle.sql`${id}::uuid`),
        m.drizzle.sql`, `,
      )})`);
    const enrollments = await db
      .select({ id: schema.challengeEnrollments.id })
      .from(schema.challengeEnrollments)
      .where(inArray(schema.challengeEnrollments.userId, ids));
    if (enrollments.length > 0) {
      await db.delete(schema.challengeProgress).where(
        inArray(
          schema.challengeProgress.enrollmentId,
          enrollments.map((e) => e.id),
        ),
      );
    }
    for (const [table, column] of [
      [schema.challengeEnrollments, schema.challengeEnrollments.userId],
      [schema.eventRegistrations, schema.eventRegistrations.userId],
      [schema.courseCertificates, schema.courseCertificates.userId],
      [schema.courseEnrollments, schema.courseEnrollments.userId],
      [schema.referralCredits, schema.referralCredits.referrerId],
      [schema.agentProfiles, schema.agentProfiles.ownerId],
      [schema.notifications, schema.notifications.userId],
      [schema.pointsEvents, schema.pointsEvents.userId],
      [schema.memberBadges, schema.memberBadges.userId],
      [schema.memberAwards, schema.memberAwards.userId],
      [schema.activityEvents, schema.activityEvents.actorId],
    ] as const) {
      await db.delete(table).where(inArray(column, ids));
    }
    await db
      .delete(schema.communityMemberships)
      .where(
        m.drizzle.eq(schema.communityMemberships.communityId, communityId),
      );
    await db
      .delete(schema.communities)
      .where(m.drizzle.eq(schema.communities.id, communityId));
    await db
      .delete(schema.memberProfiles)
      .where(inArray(schema.memberProfiles.userId, ids));
    await db.delete(schema.user).where(inArray(schema.user.id, ids));
  }, 120_000);

  describe("track metrics read their source", () => {
    const metric = (track: keyof Mods["metrics"]["TRACK_METRICS"]) =>
      m.metrics.TRACK_METRICS[track](
        { db: m.db, payload: m.getPayloadClient },
        u.metric,
      );

    it("regular: events attended", async () => {
      const { db, schema } = m;
      await db.insert(schema.eventRegistrations).values([
        { eventId: 900_001, userId: u.metric, status: "attended" },
        { eventId: 900_002, userId: u.metric, status: "attended" },
        { eventId: 900_003, userId: u.metric, status: "registered" },
      ]);
      expect(await metric("regular")).toBe(2);
    });

    it("host: live native events that started or had a check-in", async () => {
      const { db, schema } = m;
      await event("past", { organizerId: u.metric });
      await event("cancelled", { organizerId: u.metric, status: "cancelled" });
      await event("luma", { organizerId: u.metric, discoverySource: "luma" });
      const soon = new Date(Date.now() + 2 * DAY_MS).toISOString();
      const checkedIn = await event("checked-in", {
        organizerId: u.metric,
        date: soon,
      });
      await event("upcoming", { organizerId: u.metric, date: soon });
      await db.insert(schema.eventRegistrations).values({
        eventId: checkedIn,
        userId: u.other,
        status: "attended",
      });
      expect(await metric("host")).toBe(2);
    });

    it("challenger: challenges completed", async () => {
      const { db, schema } = m;
      await db.insert(schema.challengeEnrollments).values([
        { challengeId: 900_001, userId: u.metric, status: "completed" },
        { challengeId: 900_002, userId: u.metric, status: "completed" },
        { challengeId: 900_003, userId: u.metric, status: "active" },
      ]);
      expect(await metric("challenger")).toBe(2);
    });

    it("writer: articles published and approved", async () => {
      const article = (label: string, data: Record<string, unknown>) =>
        create("articles", {
          title: `BE ${label} ${suffix}`,
          slug: `be-article-${label}-${suffix}`,
          content: RICH_TEXT,
          type: "article",
          authorId: u.metric,
          authorType: "member",
          ...data,
        });
      await article("one", { reviewStatus: "approved", status: "published" });
      await article("two", { reviewStatus: "approved", status: "published" });
      await article("pending", {
        reviewStatus: "pending_review",
        status: "draft",
      });
      expect(await metric("writer")).toBe(2);
    });

    it("builder: launchpad projects published", async () => {
      const project = (label: string, status: string) =>
        create("launchpad-projects", {
          title: `BE ${label} ${suffix}`,
          slug: `be-project-${label}-${suffix}`,
          pitch: RICH_TEXT,
          stage: "mvp",
          authorId: u.metric,
          status,
        });
      await project("live", "published");
      await project("draft", "draft");
      expect(await metric("builder")).toBe(1);
    });

    it("learner: courses completed", async () => {
      const { db, schema } = m;
      await db.insert(schema.courseCertificates).values([
        { courseId: 900_001, userId: u.metric },
        { courseId: 900_002, userId: u.metric },
      ]);
      expect(await metric("learner")).toBe(2);
    });

    it("teacher: enrolments by others in the member's courses", async () => {
      const { db, schema } = m;
      const course = await create("courses", {
        title: `BE course ${suffix}`,
        slug: `be-course-${suffix}`,
        authorId: u.metric,
        status: "published",
        communityId,
      });
      await db.insert(schema.courseEnrollments).values([
        { courseId: course, userId: u.other },
        { courseId: course, userId: u.engine },
        // The author's own enrolment does not count.
        { courseId: course, userId: u.metric },
      ]);
      expect(await metric("teacher")).toBe(2);
    });

    it("connector: referrals credited", async () => {
      const { db, schema } = m;
      await db.insert(schema.referralCredits).values({
        referrerId: u.metric,
        referredUserId: u.other,
        communityId,
        xpAwarded: 0,
      });
      expect(await metric("connector")).toBe(1);
    });

    it("agent wrangler: the agent's contributions", async () => {
      const { db, schema } = m;
      expect(await metric("agent_wrangler")).toBe(0);
      await db.insert(schema.agentProfiles).values({
        ownerId: u.metric,
        name: `BE agent ${suffix}`,
        totalContributions: 12,
      });
      expect(await metric("agent_wrangler")).toBe(12);
    });

    it("benchmarker: covered cells that meet the threshold", async () => {
      const { db } = m;
      const { sql } = m.drizzle;
      const [covered, other, below] = promptIds as [string, string, string];
      await db.execute(sql`
        INSERT INTO "app"."agg_coverage_by_cell"
          (prompt_id, model_surface, window_days, distinct_contributors, runs_total, meets_threshold)
        VALUES
          (${covered}::uuid, 'api', 30, 3, 3, true),
          (${other}::uuid, 'api', 30, 3, 3, true),
          (${below}::uuid, 'api', 30, 1, 1, false)`);
      await db.execute(sql`
        INSERT INTO "app"."benchmark_run"
          (prompt_id, submitted_by_user_id, model_provider, model_surface, raw_answer, captured_at)
        VALUES
          (${covered}::uuid, ${u.metric}, 'test', 'api', 'a', now()),
          (${covered}::uuid, ${u.metric}, 'test', 'api', 'b', now()),
          (${other}::uuid, ${u.metric}, 'test', 'api', 'c', now()),
          (${below}::uuid, ${u.metric}, 'test', 'api', 'd', now())`);
      expect(await metric("benchmarker")).toBe(2);
    });

    it("streak: the longest run of active days", async () => {
      const { db, schema } = m;
      const day = (offset: number) => new Date(Date.now() - offset * DAY_MS);
      await db.insert(schema.activityEvents).values(
        [40, 39, 38, 10].map((offset) => ({
          actorId: u.metric,
          actorType: "member",
          action: "thread.create",
          createdAt: day(offset),
        })),
      );
      expect(await metric("streak")).toBe(3);
    });
  });

  describe("evaluateBadges", () => {
    const notices = (userId: string) =>
      m.db
        .select()
        .from(m.schema.notifications)
        .where(
          m.drizzle.and(
            m.drizzle.eq(m.schema.notifications.userId, userId),
            m.drizzle.eq(m.schema.notifications.type, "badge_earned"),
          ),
        );
    const points = (userId: string) =>
      m.db
        .select({ amount: m.schema.pointsEvents.amount })
        .from(m.schema.pointsEvents)
        .where(m.drizzle.eq(m.schema.pointsEvents.userId, userId));
    const earnedEvents = (userId: string) =>
      m.db
        .select({ actorType: m.schema.activityEvents.actorType })
        .from(m.schema.activityEvents)
        .where(
          m.drizzle.and(
            m.drizzle.eq(m.schema.activityEvents.actorId, userId),
            m.drizzle.eq(m.schema.activityEvents.action, "badge.earned"),
          ),
        );
    const attend = (userId: string, count: number, base: number) =>
      m.db.insert(m.schema.eventRegistrations).values(
        Array.from({ length: count }, (_, i) => ({
          eventId: base + i,
          userId,
          status: "attended" as const,
        })),
      );
    const nothing = { ok: true, earned: [], celebrated: [] };

    it("records tiers the action passed silently, and nothing twice", async () => {
      const { db, schema, engine } = m;
      await db.insert(schema.agentProfiles).values({
        ownerId: u.engine,
        name: `BE engine agent ${suffix}`,
        totalContributions: 300,
      });

      expect(
        await engine.evaluateBadges(db, u.engine, ["agent_wrangler"]),
      ).toEqual({
        ok: true,
        earned: ["agent_master", "agent_wrangler_2", "agent_wrangler_3"],
        celebrated: [],
      });
      expect(
        await engine.evaluateBadges(db, u.engine, ["agent_wrangler"]),
      ).toEqual(nothing);
      expect(await slugsOf(u.engine)).toEqual([
        "agent_master",
        "agent_wrangler_2",
        "agent_wrangler_3",
      ]);
      expect(await notices(u.engine)).toEqual([]);
      expect(await earnedEvents(u.engine)).toEqual([]);
    });

    it("celebrates the tier this action reached: XP, one notification, one event", async () => {
      const { db, engine } = m;
      await attend(u.engine, 1, 900_010);
      const xpBefore = await points(u.engine);

      expect(await engine.evaluateBadges(db, u.engine, ["regular"])).toEqual({
        ok: true,
        earned: ["first_event"],
        celebrated: ["first_event"],
      });
      expect(await engine.evaluateBadges(db, u.engine, ["regular"])).toEqual(
        nothing,
      );

      const xpAfter = await points(u.engine);
      expect(xpAfter.length - xpBefore.length).toBe(1);
      expect(xpAfter.map((row) => row.amount)).toContain(
        m.XP_AMOUNTS.FIRST_EVENT_BONUS,
      );
      const sent = await notices(u.engine);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        title: "You earned Regular I",
        content: "Attended 1 event",
        metadata: {
          badgeSlug: "first_event",
          reviewPath: `/members/${u.engine}/badges`,
        },
      });
      // Earning is a system event, so it never counts as an active day.
      expect(await earnedEvents(u.engine)).toEqual([{ actorType: "system" }]);
    });

    it("a jump from 0 to 10 celebrates only the tier at exactly 10", async () => {
      const { db, engine } = m;
      await attend(u.jump, 10, 900_100);

      expect(await engine.evaluateBadges(db, u.jump, ["regular"])).toEqual({
        ok: true,
        earned: ["first_event", "regular", "veteran"],
        celebrated: ["veteran"],
      });
      // Regular I was passed, not reached: no first-event XP bonus.
      expect(await points(u.jump)).toEqual([]);
      const sent = await notices(u.jump);
      expect(sent.map((n) => n.title)).toEqual(["You earned Regular III"]);
      expect(await engine.evaluateBadges(db, u.jump, ["regular"])).toEqual(
        nothing,
      );
      expect(await notices(u.jump)).toHaveLength(1);
    });

    it("metric 3 on a fresh member: Regular I silent, Regular II celebrated", async () => {
      const { db, engine } = m;
      await attend(u.three, 3, 900_200);

      expect(await engine.evaluateBadges(db, u.three, ["regular"])).toEqual({
        ok: true,
        earned: ["first_event", "regular"],
        celebrated: ["regular"],
      });
      expect(await points(u.three)).toEqual([]);
      expect((await notices(u.three)).map((n) => n.title)).toEqual([
        "You earned Regular II",
      ]);
    });

    it("leaves only the celebrated tier unseen for the earning moment", async () => {
      const { db, schema, drizzle } = m;
      // u.three: Regular I passed silently, Regular II reached (above).
      const rows = await db
        .select({
          slug: schema.memberBadges.badgeSlug,
          seenAt: schema.memberBadges.seenAt,
        })
        .from(schema.memberBadges)
        .where(drizzle.eq(schema.memberBadges.userId, u.three));
      const seen = Object.fromEntries(
        rows.map((row) => [row.slug, row.seenAt !== null]),
      );
      expect(seen).toEqual({ first_event: true, regular: false });
    });

    it("records backfill tiers as seen", async () => {
      const { db, schema, drizzle, engine } = m;
      expect(
        await engine.recordRetroactiveTiers(db, u.three, "learner", 3),
      ).toEqual(["course_complete", "learner_2"]);
      const rows = await db
        .select({ seenAt: schema.memberBadges.seenAt })
        .from(schema.memberBadges)
        .where(
          drizzle.and(
            drizzle.eq(schema.memberBadges.userId, u.three),
            drizzle.inArray(schema.memberBadges.badgeSlug, [
              "course_complete",
              "learner_2",
            ]),
          ),
        );
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row.seenAt).toBeInstanceOf(Date);
    });

    it("a 40-day longest streak records Streak I and II silently", async () => {
      const { db, schema, engine } = m;
      await db.insert(schema.activityEvents).values(
        Array.from({ length: 40 }, (_, i) => ({
          actorId: u.streaker,
          actorType: "member",
          action: "thread.create",
          createdAt: new Date(Date.now() - (60 - i) * DAY_MS),
        })),
      );

      expect(await engine.evaluateBadges(db, u.streaker, ["streak"])).toEqual({
        ok: true,
        earned: ["streak_1", "streak_2"],
        celebrated: [],
      });
      expect(await notices(u.streaker)).toEqual([]);
      expect(await engine.evaluateBadges(db, u.streaker, ["streak"])).toEqual(
        nothing,
      );
    });

    it("records backfill tiers silently, and throws on a failed write", async () => {
      const { db, engine } = m;
      const before = (await notices(u.engine)).length;
      expect(
        await engine.recordRetroactiveTiers(db, u.engine, "learner", 1),
      ).toEqual(["course_complete"]);
      expect((await notices(u.engine)).length).toBe(before);
      await expect(
        engine.recordRetroactiveTiers(db, `missing-${suffix}`, "learner", 1),
      ).rejects.toThrow();
    });

    it("never breaks the caller's transaction", async () => {
      const { db, schema, engine, drizzle } = m;
      const marker = `be-tx-${suffix}`;
      await db.transaction(async (tx) => {
        // No such user: the badge insert violates its foreign key.
        expect(
          await engine.awardMilestone(
            tx,
            `missing-${suffix}`,
            "profile_complete",
          ),
        ).toBe(false);
        await tx.insert(schema.activityEvents).values({
          actorId: u.engine,
          actorType: "member",
          action: marker,
        });
      });
      const rows = await db
        .select({ id: schema.activityEvents.id })
        .from(schema.activityEvents)
        .where(drizzle.eq(schema.activityEvents.action, marker));
      expect(rows).toHaveLength(1);
    });

    it("a failed guarded read (the XP boost lookup) falls back without aborting the transaction", async () => {
      const { db, schema, drizzle } = m;
      const { readOrFallback } = await import("@/lib/gamification");
      const marker = `be-boost-${suffix}`;
      await db.transaction(async (tx) => {
        const value = await readOrFallback(tx, 1, async (sp) => {
          await sp.execute(drizzle.sql`SELECT 1 / 0`);
          return 2;
        });
        expect(value).toBe(1);
        await tx.insert(schema.activityEvents).values({
          actorId: u.engine,
          actorType: "member",
          action: marker,
        });
      });
      const rows = await db
        .select({ id: schema.activityEvents.id })
        .from(schema.activityEvents)
        .where(drizzle.eq(schema.activityEvents.action, marker));
      expect(rows).toHaveLength(1);
    });
  });

  describe("hooks at the sources", () => {
    it("check-in earns the attendee Regular I and the organizer Host I", async () => {
      const { db, schema, drizzle, createCaller } = m;
      const eventId = await event("door", {
        organizerId: u.organizer,
        // Checked in before the start time: still took place.
        date: new Date(Date.now() + DAY_MS).toISOString(),
      });
      const [registration] = await db
        .insert(schema.eventRegistrations)
        .values({ eventId, userId: u.attendee, status: "registered" })
        .returning({ id: schema.eventRegistrations.id });

      const organizer = createCaller({
        db,
        session: { user: { id: u.organizer, name: u.organizer } } as never,
        headers: new Headers(),
      });
      await organizer.events.setCheckedIn({
        registrationId: registration!.id,
        checkedIn: true,
      });

      expect(await slugsOf(u.attendee)).toEqual(["first_event"]);
      expect(await slugsOf(u.organizer)).toEqual(["host_1"]);
      const [notice] = await db
        .select({ title: schema.notifications.title })
        .from(schema.notifications)
        .where(drizzle.eq(schema.notifications.userId, u.attendee));
      expect(notice?.title).toBe("You earned Regular I");
    });

    it("approving an article earns Writer I, counting that article", async () => {
      const payload = await m.getPayloadClient();
      const id = await create("articles", {
        title: `BE review ${suffix}`,
        slug: `be-article-review-${suffix}`,
        content: RICH_TEXT,
        type: "tutorial",
        authorId: u.author,
        authorType: "member",
        reviewStatus: "pending_review",
        status: "draft",
      });
      expect(await slugsOf(u.author)).toEqual([]);

      await payload.update({
        collection: "articles",
        id,
        data: { reviewStatus: "approved", status: "published" },
      });

      expect(await slugsOf(u.author)).toEqual(
        ["article_author", "tutorial_creator"].sort(),
      );
    });

    it("a trusted author's direct publish grants approval XP exactly once", async () => {
      const { db, schema, drizzle, createCaller } = m;
      await db
        .update(schema.memberProfiles)
        .set({ xp: 1000, level: 6 })
        .where(drizzle.eq(schema.memberProfiles.userId, u.trusted));
      await db
        .insert(schema.memberBadges)
        .values({ userId: u.trusted, badgeSlug: "article_author" });
      const id = await create("articles", {
        title: `BE trusted ${suffix}`,
        slug: `be-article-trusted-${suffix}`,
        content: RICH_TEXT,
        type: "article",
        authorId: u.trusted,
        authorType: "member",
        status: "draft",
      });
      const pointsOf = () =>
        db
          .select({ reason: schema.pointsEvents.reason })
          .from(schema.pointsEvents)
          .where(drizzle.eq(schema.pointsEvents.userId, u.trusted));
      const before = await pointsOf();

      const author = createCaller({
        db,
        session: { user: { id: u.trusted, name: u.trusted } } as never,
        headers: new Headers(),
      });
      await author.articles.submit({ id });

      const payload = await m.getPayloadClient();
      const published = await payload.findByID({ collection: "articles", id });
      expect(published).toMatchObject({
        status: "published",
        reviewStatus: "approved",
      });
      // One XP grant (from the collection hook), not one per code path.
      expect((await pointsOf()).length - before.length).toBe(1);
    });

    it("completing a challenge earns Challenger I and records its award", async () => {
      const { db, schema, drizzle } = m;
      const prize = `Winner — BE Hack ${suffix}`;
      const challengeId = await create("challenges", {
        title: `BE challenge ${suffix}`,
        slug: `be-challenge-${suffix}`,
        description: RICH_TEXT,
        type: "open-ended",
        status: "active",
        difficulty: "beginner",
        publishedBy: "member",
        creatorId: u.organizer,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + DAY_MS).toISOString(),
        objectives: [
          { description: "Build it", verification: "test", targetCount: 1 },
        ],
        rewards: { xpReward: 0, badgeReward: prize },
        maxParticipants: 0,
        proposedBy: u.organizer,
      });
      const [enrollment] = await db
        .insert(schema.challengeEnrollments)
        .values({ challengeId, userId: u.player })
        .returning({ id: schema.challengeEnrollments.id });
      await db.insert(schema.challengeProgress).values({
        enrollmentId: enrollment!.id,
        objectiveIndex: 0,
        currentCount: 1,
        verificationMode: "self-report",
        completedAt: new Date(),
      });

      await m.checkEnrollmentCompletion(
        db,
        enrollment!.id,
        challengeId,
        u.player,
      );

      // The prize text is an award, not a badge row.
      expect(await slugsOf(u.player)).toEqual(["first_challenge"]);
      const awards = await db
        .select({
          challengeId: schema.memberAwards.challengeId,
          label: schema.memberAwards.label,
          seenAt: schema.memberAwards.seenAt,
        })
        .from(schema.memberAwards)
        .where(drizzle.eq(schema.memberAwards.userId, u.player));
      // A live award is celebrated: unseen until the earning moment.
      expect(awards).toEqual([{ challengeId, label: prize, seenAt: null }]);
    });
  });

  describe("rarity", () => {
    it("counts holders among members with a profile, editions as numbers", async () => {
      const { db, schema, rarity } = m;
      type Report = Awaited<ReturnType<typeof rarity.loadBadgeRarity>>;
      const of = (report: Report, slug: string) =>
        report.badges.find((badge) => badge.slug === slug)!;
      /** Every share is holders ÷ the report's own denominator. */
      const consistent = (report: Report) => {
        for (const badge of report.badges) {
          if (badge.measure === "share") {
            expect(badge.share, badge.slug).toBeCloseTo(
              report.members > 0 ? badge.holders / report.members : 0,
              12,
            );
          }
        }
      };

      // Other DB suites add and remove members on the shared test database
      // while this runs. One repeatable-read snapshot sees none of their
      // commits, so the before/after difference is exactly this test's
      // writes; rolling back leaves nothing behind.
      class Rollback extends Error {}
      let reports: { before: Report; after: Report } | undefined;
      await db
        .transaction(
          async (tx) => {
            const before = await rarity.loadBadgeRarity(tx);
            await tx.insert(schema.memberBadges).values([
              { userId: u.other, badgeSlug: "early_adopter" },
              { userId: u.other, badgeSlug: "veteran" },
            ]);
            reports = { before, after: await rarity.loadBadgeRarity(tx) };
            throw new Rollback();
          },
          { isolationLevel: "repeatable read" },
        )
        .catch((error: unknown) => {
          if (!(error instanceof Rollback)) throw error;
        });
      const { before, after } = reports!;

      expect(after.members).toBe(before.members);
      expect(of(after, "veteran").holders).toBe(
        of(before, "veteran").holders + 1,
      );
      expect(of(after, "veteran")).toMatchObject({ measure: "share" });
      expect(of(after, "early_adopter")).toEqual({
        slug: "early_adopter",
        measure: "count",
        holders: of(before, "early_adopter").holders + 1,
        editionSize: 100,
      });
      expect(after.badges).toHaveLength(before.badges.length);
      consistent(before);
      consistent(after);

      // The public procedure returns the same DTO shape, internally
      // consistent (its totals are global, so not compared by value).
      rarity.clearBadgeRarityCache();
      const caller = m.createCaller({
        db,
        session: null,
        headers: new Headers(),
      });
      const report = await caller.badges.rarity();
      expect(report.badges.map((b) => b.slug)).toEqual(
        after.badges.map((b) => b.slug),
      );
      consistent(report);
    });
  });
});
