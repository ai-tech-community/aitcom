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

describe.skipIf(!RUN_DB)("classroom builder server [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    payload: Awaited<
      ReturnType<typeof import("@/server/payload").getPayloadClient>
    >;
  };
  let m: Mods;
  let fx: {
    sfx: string;
    authorId: string;
    otherId: string;
    communityId: string;
    communitySlug: string;
    courseIds: number[];
  };

  beforeAll(async () => {
    const [{ db }, schema, { createCaller }, { getPayloadClient }] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/payload"),
      ]);
    m = { db, schema, createCaller, payload: await getPayloadClient() };
  }, 120_000);

  beforeEach(async () => {
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const authorId = `cb-author-${sfx}`;
    const otherId = `cb-other-${sfx}`;
    await m.db
      .insert(m.schema.user)
      .values(
        [authorId, otherId].map((id) => ({
          id,
          email: `${id}@example.test`,
          name: id,
        })),
      );
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({
        name: `Builder ${sfx}`,
        slug: `builder-${sfx}`,
        createdBy: authorId,
      })
      .returning();
    await m.db.insert(m.schema.communityMemberships).values([
      { communityId: community!.id, userId: authorId, role: "member" },
      { communityId: community!.id, userId: otherId, role: "member" },
    ]);
    fx = {
      sfx,
      authorId,
      otherId,
      communityId: community!.id,
      communitySlug: community!.slug,
      courseIds: [],
    };
  });

  afterEach(async () => {
    const { eq, inArray } = await import("drizzle-orm");
    if (fx.courseIds.length) {
      await m.payload.delete({
        collection: "lessons",
        where: { course: { in: fx.courseIds } },
      });
      await m.payload.delete({
        collection: "modules",
        where: { course: { in: fx.courseIds } },
      });
      await m.payload.delete({
        collection: "courses",
        where: { id: { in: fx.courseIds } },
      });
    }
    await m.db
      .delete(m.schema.activityEvents)
      .where(eq(m.schema.activityEvents.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communityMemberships)
      .where(eq(m.schema.communityMemberships.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communities)
      .where(eq(m.schema.communities.id, fx.communityId));
    await m.db
      .delete(m.schema.user)
      .where(inArray(m.schema.user.id, [fx.authorId, fx.otherId]));
  });

  function callerAs(userId: string) {
    return m.createCaller({
      db: m.db,
      headers: new Headers(),
      session: { user: { id: userId, name: userId }, session: {} } as never,
    });
  }

  async function createViaApi(title = "Builder course") {
    const res = await callerAs(fx.authorId).classrooms.create({
      communitySlug: fx.communitySlug,
      title,
    });
    fx.courseIds.push(res.id);
    return res;
  }

  describe("course status", () => {
    it("creates new courses as drafts by default", async () => {
      const { id } = await createViaApi();
      const course = await m.payload.findByID({
        collection: "courses",
        id,
        depth: 0,
      });
      expect(course.status).toBe("draft");
    });

    it("refuses to move an archived course back to published", async () => {
      const { id } = await createViaApi();
      await m.payload.update({
        collection: "courses",
        id,
        data: { status: "archived" },
      });
      await expect(
        callerAs(fx.authorId).classrooms.update({
          courseId: id,
          status: "published",
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "COURSE_ARCHIVED",
      });
    });

    it("still lets the author fix the title of an archived course without touching status", async () => {
      const { id } = await createViaApi();
      await m.payload.update({
        collection: "courses",
        id,
        data: { status: "archived" },
      });
      await callerAs(fx.authorId).classrooms.update({
        courseId: id,
        title: "Fixed title",
      });
      const course = await m.payload.findByID({
        collection: "courses",
        id,
        depth: 0,
      });
      expect(course.status).toBe("archived");
      expect(course.title).toBe("Fixed title");
    });

    it("logs course.published once when a draft is published", async () => {
      const { eq, and } = await import("drizzle-orm");
      const { id } = await createViaApi();
      const publishedRows = () =>
        m.db
          .select()
          .from(m.schema.activityEvents)
          .where(
            and(
              eq(m.schema.activityEvents.action, "course.published"),
              eq(m.schema.activityEvents.targetId, String(id)),
            ),
          );
      // A fresh draft has not been published, so nothing is logged yet.
      expect(await publishedRows()).toHaveLength(0);
      await callerAs(fx.authorId).classrooms.update({
        courseId: id,
        status: "published",
      });
      await callerAs(fx.authorId).classrooms.update({
        courseId: id,
        status: "published",
      });
      expect(await publishedRows()).toHaveLength(1);
    });
  });

  describe("save conflicts", () => {
    it("returns the new updatedAt and accepts it on the next save", async () => {
      const { id } = await createViaApi();
      const before = await m.payload.findByID({
        collection: "courses",
        id,
        depth: 0,
      });
      const first = await callerAs(fx.authorId).classrooms.update({
        courseId: id,
        summary: "one",
        expectedUpdatedAt: before.updatedAt,
      });
      const after = await m.payload.findByID({
        collection: "courses",
        id,
        depth: 0,
      });
      expect(first.updatedAt).toBe(after.updatedAt);
      expect(first.updatedAt).not.toBe(before.updatedAt);
      await expect(
        callerAs(fx.authorId).classrooms.update({
          courseId: id,
          summary: "two",
          expectedUpdatedAt: first.updatedAt,
        }),
      ).resolves.toMatchObject({ ok: true });
    });

    it("refuses a save based on a stale updatedAt", async () => {
      const { id } = await createViaApi();
      const before = await m.payload.findByID({
        collection: "courses",
        id,
        depth: 0,
      });
      await callerAs(fx.authorId).classrooms.update({
        courseId: id,
        summary: "other tab",
      });
      await expect(
        callerAs(fx.authorId).classrooms.update({
          courseId: id,
          summary: "this tab",
          expectedUpdatedAt: before.updatedAt,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT", message: "COURSE_CHANGED" });
    });
  });
});
