// @vitest-environment node
/**
 * DB-INTEGRATION test: the profile frame's public procedures follow the
 * profile rule and each item's own visibility, and return only their DTOs.
 *
 * - members.getPublicCommunities: listed communities; unlisted ones only for
 *   a viewer who is an active member too; never the Hub, a pending or banned
 *   membership, or a deleted community.
 * - members.getPublicActivity: dates and day totals from points only.
 * - members.getPublicWork: every list filtered by its own rule, with one
 *   Payload query per collection.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/members/profile-frame.integration.test.ts
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

const sorted = (o: object) => Object.keys(o).sort();

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
        children: [{ type: "text", text: "profile frame integration test" }],
      },
    ],
  },
};

const SECRET_REASON = "private_reason_marker";

function utcDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!RUN_DB)("profile frame procedures [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    getPayloadClient: typeof import("@/server/payload").getPayloadClient;
    drizzle: typeof import("drizzle-orm");
    hubSlug: string;
  };
  let m: Mods;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const u = {
    /** Public member: communities and work. */
    member: `pf-member-${suffix}`,
    /** Public member with points (no work, so no XP from work hooks). */
    active: `pf-active-${suffix}`,
    /** Private member. */
    priv: `pf-priv-${suffix}`,
    /** Active member of the unlisted community. */
    coMember: `pf-co-${suffix}`,
    /** Signed-in member of nothing in particular. */
    outsider: `pf-out-${suffix}`,
  };
  const c = {} as {
    listed: string;
    unlisted: string;
    pendingListed: string;
    bannedListed: string;
    deleted: string;
    hub: string;
  };
  let createdHub = false;
  const payloadIds: { collection: string; id: number }[] = [];
  let challengeId = 0;
  const course = {} as { publicListed: number; membersOnly: number };

  function callerAs(userId: string | null) {
    return m.createCaller({
      db: m.db,
      session: userId
        ? ({ user: { id: userId, name: userId } } as never)
        : null,
      headers: new Headers(),
    });
  }

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [
      { db },
      schema,
      { createCaller },
      { getPayloadClient },
      drizzle,
      { HUB_SLUG },
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/api/root"),
      import("@/server/payload"),
      import("drizzle-orm"),
      import("@/server/communities/hub"),
    ]);
    m = {
      db,
      schema,
      createCaller,
      getPayloadClient,
      drizzle,
      hubSlug: HUB_SLUG,
    };

    await db.insert(schema.user).values(
      Object.values(u).map((id) => ({
        id,
        email: `${id}@aitcom.test`,
        name: id,
      })),
    );
    await db.insert(schema.memberProfiles).values([
      { userId: u.member, displayName: `Member ${suffix}`, isPublic: true },
      { userId: u.active, displayName: `Active ${suffix}`, isPublic: true },
      { userId: u.priv, displayName: `Private ${suffix}`, isPublic: false },
      { userId: u.coMember, displayName: `Co ${suffix}`, isPublic: true },
      { userId: u.outsider, displayName: `Out ${suffix}`, isPublic: true },
    ]);

    const insertCommunity = async (
      label: string,
      over: Partial<typeof schema.communities.$inferInsert> = {},
    ) => {
      const [row] = await db
        .insert(schema.communities)
        .values({
          name: `PF ${label} ${suffix}`,
          slug: `pf-${label}-${suffix}`,
          createdBy: u.outsider,
          isListedInDirectory: true,
          ...over,
        })
        .returning({ id: schema.communities.id });
      return row!.id;
    };
    c.listed = await insertCommunity("listed");
    c.unlisted = await insertCommunity("unlisted", {
      isListedInDirectory: false,
    });
    c.pendingListed = await insertCommunity("pending");
    c.bannedListed = await insertCommunity("banned");
    c.deleted = await insertCommunity("deleted", { deletedAt: new Date() });

    const existingHub = await db.query.communities.findFirst({
      where: drizzle.eq(schema.communities.slug, HUB_SLUG),
      columns: { id: true },
    });
    if (existingHub) {
      c.hub = existingHub.id;
    } else {
      const [hub] = await db
        .insert(schema.communities)
        .values({
          name: `PF hub ${suffix}`,
          slug: HUB_SLUG,
          createdBy: u.outsider,
          isListedInDirectory: false,
        })
        .returning({ id: schema.communities.id });
      c.hub = hub!.id;
      createdHub = true;
    }

    await db.insert(schema.communityMemberships).values([
      { communityId: c.listed, userId: u.member },
      { communityId: c.unlisted, userId: u.member },
      {
        communityId: c.pendingListed,
        userId: u.member,
        status: "pending_approval",
      },
      { communityId: c.bannedListed, userId: u.member, status: "banned" },
      { communityId: c.deleted, userId: u.member },
      { communityId: c.unlisted, userId: u.coMember },
      { communityId: c.listed, userId: u.priv },
    ]);
    await db
      .insert(schema.communityMemberships)
      .values({ communityId: c.hub, userId: u.member })
      .onConflictDoNothing();

    // Activity: a 4-day run long ago, and the last three days up to today.
    const at = (day: string) => new Date(`${day}T12:00:00Z`);
    await db.insert(schema.pointsEvents).values([
      ...[-500, -499, -498, -497].map((offset) => ({
        userId: u.active,
        amount: 5,
        reason: SECRET_REASON,
        createdAt: at(utcDay(offset)),
      })),
      {
        userId: u.active,
        amount: 10,
        reason: SECRET_REASON,
        createdAt: at(utcDay(-2)),
      },
      {
        userId: u.active,
        amount: 15,
        reason: SECRET_REASON,
        createdAt: at(utcDay(-1)),
      },
      {
        userId: u.active,
        amount: 20,
        reason: SECRET_REASON,
        createdAt: at(utcDay(0)),
      },
      {
        userId: u.active,
        amount: 5,
        reason: SECRET_REASON,
        createdAt: at(utcDay(0)),
      },
      {
        userId: u.priv,
        amount: 5,
        reason: SECRET_REASON,
        createdAt: at(utcDay(0)),
      },
    ]);

    // Work.
    const payload = await getPayloadClient();
    const create = async (
      collection: string,
      data: Record<string, unknown>,
      options: Record<string, unknown> = {},
    ) => {
      const doc = (await payload.create({
        collection: collection as never,
        data: data as never,
        ...options,
      })) as unknown as { id: number };
      payloadIds.push({ collection, id: doc.id });
      return doc.id;
    };

    await create("articles", {
      title: `PF approved ${suffix}`,
      slug: `pf-approved-${suffix}`,
      content: RICH_TEXT,
      type: "article",
      authorId: u.member,
      authorType: "member",
      reviewStatus: "approved",
      status: "published",
    });
    await create("articles", {
      title: `PF pending ${suffix}`,
      slug: `pf-pending-${suffix}`,
      content: RICH_TEXT,
      type: "article",
      authorId: u.member,
      authorType: "member",
      reviewStatus: "pending_review",
      status: "draft",
    });

    const project = (label: string, data: Record<string, unknown>) =>
      create("launchpad-projects", {
        title: `PF ${label} ${suffix}`,
        slug: `pf-project-${label}-${suffix}`,
        pitch: RICH_TEXT,
        stage: "mvp",
        authorId: u.member,
        status: "published",
        ...data,
      });
    await project("listed", { communityId: c.listed });
    await project("unlisted", { communityId: c.unlisted });
    await project("draft", { communityId: c.listed, status: "draft" });
    await project("unscoped", {});

    const courseDoc = (label: string, data: Record<string, unknown>) =>
      create("courses", {
        title: `PF course ${label} ${suffix}`,
        slug: `pf-course-${label}-${suffix}`,
        authorId: u.member,
        status: "published",
        ...data,
      });
    course.publicListed = await courseDoc("public", {
      communityId: c.listed,
      isPublic: true,
    });
    course.membersOnly = await courseDoc("members", {
      communityId: c.unlisted,
      isPublic: false,
    });
    await courseDoc("draft", { communityId: c.listed, status: "draft" });

    const event = (label: string, data: Record<string, unknown>) =>
      create(
        "events",
        {
          title: `PF event ${label} ${suffix}`,
          slug: `pf-event-${label}-${suffix}`,
          description: RICH_TEXT,
          type: "meetup",
          status: "published",
          date: new Date(Date.now() - 86_400_000).toISOString(),
          startTime: "19:00",
          timezone: "Europe/Amsterdam",
          location: "Test Lab",
          organizerId: u.member,
          ...data,
        },
        { context: { skipGeocode: true } },
      );
    await event("listed", { communityId: c.listed });
    await event("cancelled", { communityId: c.listed, status: "cancelled" });
    await event("luma", { communityId: c.listed, discoverySource: "luma" });
    await event("unlisted", { communityId: c.unlisted });
    await event("completed", { status: "completed" });

    challengeId = await create("challenges", {
      title: `PF challenge ${suffix}`,
      slug: `pf-challenge-${suffix}`,
      description: RICH_TEXT,
      type: "open-ended",
      status: "draft",
      difficulty: "beginner",
      publishedBy: "member",
      creatorId: u.outsider,
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
      objectives: [
        { description: "Build it", verification: "test", targetCount: 1 },
      ],
      rewards: { xpReward: 0 },
      maxParticipants: 0,
      proposedBy: u.outsider,
      communityId: c.listed,
    });
    await db.insert(schema.hackathonCertificates).values({
      challengeId,
      userId: u.member,
      kind: "winner",
    });
    await db.insert(schema.courseCertificates).values([
      { courseId: course.publicListed, userId: u.member },
      { courseId: course.membersOnly, userId: u.member },
    ]);
  }, 120_000);

  afterAll(async () => {
    if (!m) return;
    const { db, schema } = m;
    const { inArray } = m.drizzle;
    const ids = Object.values(u);
    const payload = await m.getPayloadClient();
    for (const { collection, id } of payloadIds.reverse()) {
      try {
        await payload.delete({ collection: collection as never, id });
      } catch {
        // Best-effort teardown.
      }
    }
    await db
      .delete(schema.hackathonCertificates)
      .where(inArray(schema.hackathonCertificates.userId, ids));
    await db
      .delete(schema.courseCertificates)
      .where(inArray(schema.courseCertificates.userId, ids));
    await db
      .delete(schema.pointsEvents)
      .where(inArray(schema.pointsEvents.userId, ids));
    await db
      .delete(schema.memberBadges)
      .where(inArray(schema.memberBadges.userId, ids));
    await db
      .delete(schema.activityEvents)
      .where(inArray(schema.activityEvents.actorId, ids));
    await db
      .delete(schema.communityMemberships)
      .where(inArray(schema.communityMemberships.userId, ids));
    const communityIds = [
      c.listed,
      c.unlisted,
      c.pendingListed,
      c.bannedListed,
      c.deleted,
      ...(createdHub ? [c.hub] : []),
    ].filter(Boolean);
    await db
      .delete(schema.communities)
      .where(inArray(schema.communities.id, communityIds));
    await db
      .delete(schema.memberProfiles)
      .where(inArray(schema.memberProfiles.userId, ids));
    await db.delete(schema.user).where(inArray(schema.user.id, ids));
  }, 120_000);

  describe("getPublicCommunities", () => {
    const names = (rows: { name: string }[] | null) =>
      (rows ?? []).map((r) => r.name).sort();

    it("returns only the panel's fields", async () => {
      const rows = await callerAs(null).members.getPublicCommunities({
        userId: u.member,
      });
      expect(rows).not.toBeNull();
      for (const row of rows!) {
        expect(sorted(row)).toEqual(["logoUrl", "name", "slug"]);
      }
    });

    it("shows a visitor only listed communities with an active membership", async () => {
      for (const viewer of [null, u.outsider]) {
        const rows = await callerAs(viewer).members.getPublicCommunities({
          userId: u.member,
        });
        expect(names(rows)).toEqual([`PF listed ${suffix}`]);
      }
    });

    it("shows an unlisted community to a viewer who is an active member too", async () => {
      const rows = await callerAs(u.coMember).members.getPublicCommunities({
        userId: u.member,
      });
      expect(names(rows)).toEqual(
        [`PF listed ${suffix}`, `PF unlisted ${suffix}`].sort(),
      );
    });

    it("shows the owner every active membership except the Hub", async () => {
      const rows = await callerAs(u.member).members.getPublicCommunities({
        userId: u.member,
      });
      expect(names(rows)).toEqual(
        [`PF listed ${suffix}`, `PF unlisted ${suffix}`].sort(),
      );
      expect((rows ?? []).map((r) => r.slug)).not.toContain(m.hubSlug);
    });

    it("returns nothing for a private profile, except to its owner", async () => {
      for (const viewer of [null, u.outsider]) {
        await expect(
          callerAs(viewer).members.getPublicCommunities({ userId: u.priv }),
        ).resolves.toBeNull();
      }
      const own = await callerAs(u.priv).members.getPublicCommunities({
        userId: u.priv,
      });
      expect(names(own)).toEqual([`PF listed ${suffix}`]);
    });
  });

  describe("getPublicActivity", () => {
    it("returns dates and day totals only, never reasons", async () => {
      const activity = await callerAs(null).members.getPublicActivity({
        userId: u.active,
      });
      expect(activity).not.toBeNull();
      expect(sorted(activity!)).toEqual([
        "currentStreak",
        "days",
        "longestStreak",
      ]);
      expect(activity!.days).toEqual([
        { date: utcDay(-2), xp: 10 },
        { date: utcDay(-1), xp: 15 },
        { date: utcDay(0), xp: 25 },
      ]);
      expect(JSON.stringify(activity)).not.toContain(SECRET_REASON);
    });

    it("computes streaks over all days, the calendar over the last year", async () => {
      const activity = await callerAs(null).members.getPublicActivity({
        userId: u.active,
      });
      expect(activity!.currentStreak).toBe(3);
      expect(activity!.longestStreak).toBe(4);
    });

    it("follows the profile's visibility", async () => {
      for (const viewer of [null, u.outsider]) {
        await expect(
          callerAs(viewer).members.getPublicActivity({ userId: u.priv }),
        ).resolves.toBeNull();
      }
      const own = await callerAs(u.priv).members.getPublicActivity({
        userId: u.priv,
      });
      expect(own?.days).toEqual([{ date: utcDay(0), xp: 5 }]);
    });
  });

  describe("getPublicWork", () => {
    const titles = (list: { items: { title: string | null }[] }) =>
      list.items.map((i) => i.title).sort();

    it("shows a visitor only what each item's own rule allows", async () => {
      const work = await callerAs(u.outsider).members.getPublicWork({
        userId: u.member,
        locale: "en",
      });
      expect(work).not.toBeNull();
      expect(sorted(work!)).toEqual([
        "articles",
        "certificates",
        "courses",
        "events",
        "projects",
      ]);
      expect(titles(work!.articles)).toEqual([`PF approved ${suffix}`]);
      expect(titles(work!.projects)).toEqual(
        [`PF listed ${suffix}`, `PF unscoped ${suffix}`].sort(),
      );
      expect(titles(work!.courses)).toEqual([`PF course public ${suffix}`]);
      expect(titles(work!.events)).toEqual(
        [`PF event completed ${suffix}`, `PF event listed ${suffix}`].sort(),
      );
      expect(
        work!.certificates.items.map((cert) => [cert.kind, cert.title]),
      ).toEqual(
        expect.arrayContaining([
          ["hackathon", `PF challenge ${suffix}`],
          ["course", `PF course public ${suffix}`],
        ]),
      );
      expect(work!.certificates.items).toHaveLength(2);
    });

    it("returns only the fields each list renders", async () => {
      const work = await callerAs(null).members.getPublicWork({
        userId: u.member,
        locale: "en",
      });
      expect(sorted(work!.articles)).toEqual(["hasMore", "items"]);
      expect(sorted(work!.articles.items[0]!)).toEqual([
        "id",
        "publishedAt",
        "slug",
        "title",
      ]);
      expect(sorted(work!.projects.items[0]!)).toEqual([
        "createdAt",
        "id",
        "slug",
        "stage",
        "title",
      ]);
      expect(sorted(work!.courses.items[0]!)).toEqual([
        "communitySlug",
        "createdAt",
        "id",
        "slug",
        "title",
      ]);
      expect(sorted(work!.events.items[0]!)).toEqual([
        "date",
        "id",
        "slug",
        "title",
      ]);
      const hackathon = work!.certificates.items.find(
        (cert) => cert.kind === "hackathon",
      );
      expect(sorted(hackathon!)).toEqual([
        "challengeSlug",
        "id",
        "issuedAt",
        "kind",
        "outcome",
        "title",
      ]);
    });

    it("shows unlisted-community work to a viewer who is a member there", async () => {
      const work = await callerAs(u.coMember).members.getPublicWork({
        userId: u.member,
        locale: "en",
      });
      expect(titles(work!.projects)).toContain(`PF unlisted ${suffix}`);
      expect(titles(work!.courses)).toContain(`PF course members ${suffix}`);
      expect(titles(work!.events)).toContain(`PF event unlisted ${suffix}`);
      expect(work!.certificates.items.map((cert) => cert.title)).toContain(
        `PF course members ${suffix}`,
      );
      // Still never drafts, cancelled or imported rows.
      expect(titles(work!.projects)).not.toContain(`PF draft ${suffix}`);
      expect(titles(work!.courses)).not.toContain(`PF course draft ${suffix}`);
      expect(titles(work!.events)).not.toContain(
        `PF event cancelled ${suffix}`,
      );
      expect(titles(work!.events)).not.toContain(`PF event luma ${suffix}`);
    });

    it("queries Payload once per collection, with the visibility filters", async () => {
      const payload = await m.getPayloadClient();
      const find = vi.spyOn(payload, "find");
      try {
        await callerAs(u.outsider).members.getPublicWork({
          userId: u.member,
          locale: "nl",
        });
        const calls = find.mock.calls.map(([args]) => args);
        const byCollection = (name: string) =>
          calls.filter((args) => args.collection === name);
        expect(byCollection("articles")).toHaveLength(1);
        expect(byCollection("launchpad-projects")).toHaveLength(1);
        expect(byCollection("events")).toHaveLength(1);
        expect(byCollection("challenges")).toHaveLength(1);
        // Authored courses, plus the certificates' courses.
        expect(byCollection("courses")).toHaveLength(2);
        expect(calls).toHaveLength(6);

        const [events] = byCollection("events");
        expect(events).toMatchObject({
          draft: false,
          locale: "nl",
          sort: "-date",
        });
        expect(JSON.stringify(events!.where)).toContain(c.unlisted);
        const [projects] = byCollection("launchpad-projects");
        expect(JSON.stringify(projects!.where)).toContain(c.unlisted);
        const [articles] = byCollection("articles");
        expect(articles).toMatchObject({ draft: false, locale: "nl" });
      } finally {
        find.mockRestore();
      }
    });

    it("returns nothing for a private profile, except to its owner", async () => {
      for (const viewer of [null, u.outsider]) {
        await expect(
          callerAs(viewer).members.getPublicWork({
            userId: u.priv,
            locale: "en",
          }),
        ).resolves.toBeNull();
      }
      await expect(
        callerAs(u.priv).members.getPublicWork({
          userId: u.priv,
          locale: "en",
        }),
      ).resolves.not.toBeNull();
    });
  });
});
