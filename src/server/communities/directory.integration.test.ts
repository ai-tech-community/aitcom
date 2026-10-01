// @vitest-environment node
/**
 * DB-INTEGRATION test for the public directory (`communities.directory`).
 * Proves, against a REAL local DB + Payload, that the Explore page gets:
 * listed communities only, the real join policy, recent activity, the next
 * upcoming native event (not a past one, not a discovered Luma one), the
 * places of upcoming events, search over the description, and the place
 * filter.
 *
 * Auto-skips unless RUN_DB_TESTS=1 and a local database is configured:
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/communities/directory.integration.test.ts
 */

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
        children: [{ type: "text", text: "directory integration test" }],
      },
    ],
  },
};

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!RUN_DB)("communities.directory [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    getPayloadClient: typeof import("@/server/payload").getPayloadClient;
    inArray: typeof import("drizzle-orm").inArray;
    invalidate: typeof import("@/server/communities/directory-queries").invalidateDirectorySnapshots;
  };
  let m: Mods;

  type Fixture = {
    suffix: string;
    userIds: string[];
    communityIds: string[];
    eventIds: number[];
    courseId: number;
    open: string;
    approval: string;
    unlisted: string;
  };
  let fx: Fixture;

  beforeAll(async () => {
    const [
      { db },
      schema,
      { createCaller },
      { getPayloadClient },
      drizzle,
      { invalidateDirectorySnapshots },
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/api/root"),
      import("@/server/payload"),
      import("drizzle-orm"),
      import("@/server/communities/directory-queries"),
    ]);
    m = {
      db,
      schema,
      createCaller,
      getPayloadClient,
      inArray: drizzle.inArray,
      invalidate: invalidateDirectorySnapshots,
    };
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
  });

  function guest() {
    return m.createCaller({
      db: m.db,
      session: null,
      headers: new Headers(),
    });
  }

  beforeEach(async () => {
    const { db, schema } = m;
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const owner = `it-dir-owner-${suffix}`;
    const member = `it-dir-member-${suffix}`;
    for (const id of [owner, member]) {
      await db
        .insert(schema.user)
        .values({ id, email: `${id}@example.test`, name: id });
    }

    const insertCommunity = async (
      label: string,
      over: Partial<typeof schema.communities.$inferInsert>,
    ) => {
      const [row] = await db
        .insert(schema.communities)
        .values({
          name: `Directory ${label} ${suffix}`,
          slug: `it-dir-${label}-${suffix}`,
          description: `Builders meeting in town ${suffix}`,
          createdBy: owner,
          isListedInDirectory: true,
          ...over,
        })
        .returning({ id: schema.communities.id });
      return row!.id;
    };
    const open = await insertCommunity("open", { joinPolicy: "open" });
    const approval = await insertCommunity("approval", {
      joinPolicy: "approval_required",
      description: `Agents only ${suffix}`,
    });
    const unlisted = await insertCommunity("unlisted", {
      isListedInDirectory: false,
    });

    await db.insert(schema.communityMemberships).values([
      { communityId: open, userId: owner, role: "owner" },
      { communityId: open, userId: member },
      { communityId: approval, userId: owner, role: "owner" },
    ]);
    await db.insert(schema.spaces).values({
      communityId: open,
      kind: "room",
      visibility: "public",
      name: "lobby",
      slug: `lobby-${suffix}`,
      position: 100,
      createdBy: owner,
    });
    await db.insert(schema.activityEvents).values({
      communityId: open,
      actorId: member,
      actorType: "user",
      action: "thread.create",
    });

    const payload = await m.getPayloadClient();
    const createEvent = async (
      label: string,
      data: Record<string, unknown>,
    ) => {
      const doc = await payload.create({
        collection: "events",
        data: {
          title: `Directory ${label} ${suffix}`,
          slug: `it-dir-${label}-${suffix}`,
          description: RICH_TEXT,
          type: "meetup" as const,
          status: "published" as const,
          startTime: "19:00",
          timezone: "Europe/Amsterdam",
          location: "Test Lab",
          ...data,
        } as never,
        context: { skipGeocode: true },
      });
      return doc.id;
    };
    const eventIds = [
      await createEvent("past", {
        communityId: open,
        date: isoDay(-10),
        city: "Rotterdam",
      }),
      await createEvent("later", {
        communityId: open,
        date: isoDay(20),
        format: "online",
        location: "Online",
      }),
      await createEvent("next", {
        communityId: open,
        date: isoDay(5),
        city: "Utrecht",
        latitude: 52.09,
        longitude: 5.12,
      }),
      await createEvent("luma", {
        communityId: approval,
        date: isoDay(3),
        city: "Delft",
        discoverySource: "luma",
      }),
      await createEvent("unlisted", {
        communityId: unlisted,
        date: isoDay(4),
        city: "Leiden",
      }),
    ];

    const course = await payload.create({
      collection: "courses",
      data: {
        title: `Directory course ${suffix}`,
        slug: `it-dir-course-${suffix}`,
        authorId: owner,
        status: "published",
        isPublic: true,
        communityId: open,
      } as never,
    });

    fx = {
      suffix,
      userIds: [owner, member],
      communityIds: [open, approval, unlisted],
      eventIds,
      courseId: course.id,
      open,
      approval,
      unlisted,
    };
    // Each test seeds fresh rows; start from a fresh snapshot.
    m.invalidate();
  });

  afterEach(async () => {
    const { db, schema, inArray } = m;
    const payload = await m.getPayloadClient();
    try {
      await payload.delete({ collection: "courses", id: fx.courseId });
    } catch {
      // Best-effort teardown.
    }
    for (const id of fx.eventIds) {
      try {
        await payload.delete({ collection: "events", id });
      } catch {
        // Best-effort teardown.
      }
    }
    await db
      .delete(schema.activityEvents)
      .where(inArray(schema.activityEvents.communityId, fx.communityIds));
    await db
      .delete(schema.spaces)
      .where(inArray(schema.spaces.communityId, fx.communityIds));
    await db
      .delete(schema.communityMemberships)
      .where(inArray(schema.communityMemberships.communityId, fx.communityIds));
    await db
      .delete(schema.communities)
      .where(inArray(schema.communities.id, fx.communityIds));
    await db.delete(schema.user).where(inArray(schema.user.id, fx.userIds));
  });

  it("returns listed communities with their real public signals", async () => {
    const out = await guest().communities.directory({ q: fx.suffix });
    const ids = out.items.map((c) => c.id);
    expect(ids).toContain(fx.open);
    expect(ids).toContain(fx.approval);
    expect(ids).not.toContain(fx.unlisted);

    const open = out.items.find((c) => c.id === fx.open)!;
    expect(open).toMatchObject({
      joinPolicy: "open",
      memberCount: 2,
      activeRecently: 1,
      isNew: true,
      openRooms: 1,
    });
    expect(open.nextEvent).toEqual({
      date: expect.stringContaining(isoDay(5)),
      city: "Utrecht",
      online: false,
    });
    // Ranking internals stay on the server.
    expect(open).not.toHaveProperty("score");
    expect(open).not.toHaveProperty("newJoins");
    expect(out.places.map((p) => p.key)).toEqual(
      expect.arrayContaining(["Utrecht", "online"]),
    );

    const approval = out.items.find((c) => c.id === fx.approval)!;
    expect(approval.joinPolicy).toBe("approval_required");
    // A discovered (Luma) event is not the community's own next event.
    expect(approval.nextEvent).toBeNull();
    expect(out.places.map((p) => p.key)).not.toContain("Delft");
    expect(out.places.map((p) => p.key)).not.toContain("Leiden");
  });

  it("puts the busier community first when sorting by activity", async () => {
    const out = await guest().communities.directory({
      q: fx.suffix,
      sort: "active",
    });
    expect(out.items.map((c) => c.id)).toEqual([fx.open, fx.approval]);
  });

  it("searches the description as well as the name", async () => {
    const out = await guest().communities.directory({
      q: `Agents only ${fx.suffix}`,
    });
    expect(out.items.map((c) => c.id)).toEqual([fx.approval]);
  });

  it("filters by the place of upcoming events", async () => {
    const utrecht = await guest().communities.directory({
      q: fx.suffix,
      place: "utrecht",
    });
    expect(utrecht.items.map((c) => c.id)).toEqual([fx.open]);
    expect(utrecht.places.map((p) => p.key)).toEqual(
      expect.arrayContaining(["Utrecht", "online"]),
    );
    const leiden = await guest().communities.directory({
      q: fx.suffix,
      place: "Leiden",
    });
    expect(leiden.items).toEqual([]);
  });

  it("shows a new community to the next request after it is created", async () => {
    const before = await guest().communities.directory({ q: fx.suffix });
    await m.db
      .update(m.schema.communities)
      .set({ isListedInDirectory: true })
      .where(m.inArray(m.schema.communities.id, [fx.unlisted]));
    const cached = await guest().communities.directory({ q: fx.suffix });
    expect(cached.total).toBe(before.total);
    m.invalidate();
    const fresh = await guest().communities.directory({ q: fx.suffix });
    expect(fresh.items.map((c) => c.id)).toContain(fx.unlisted);
  });

  it("says what a community offers and how far it is", async () => {
    const amsterdam = { lat: 52.37, lng: 4.9 };
    const out = await guest().communities.directory({
      q: fx.suffix,
      sort: "near",
      near: amsterdam,
    });
    const open = out.items.find((c) => c.id === fx.open)!;
    const approval = out.items.find((c) => c.id === fx.approval)!;
    // An in-person event (meet) and a public course (learn).
    expect(open.wants).toEqual(["meet", "learn"]);
    expect(approval.wants).toEqual([]);
    // Utrecht is about 35 km from Amsterdam; no located event, no distance.
    expect(open.distanceKm).toBeGreaterThan(30);
    expect(open.distanceKm).toBeLessThan(45);
    expect(approval.distanceKm).toBeNull();
    expect(out.items.map((c) => c.id)).toEqual([fx.open, fx.approval]);
    expect(out.origin).toEqual({ precise: true, city: null });

    const learning = await guest().communities.directory({
      q: fx.suffix,
      want: "learn",
    });
    expect(learning.items.map((c) => c.id)).toEqual([fx.open]);
  });
});
