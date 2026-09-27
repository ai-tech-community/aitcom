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
  describe("lesson order", () => {
    async function seedModuled() {
      const { id } = await createViaApi();
      const api = callerAs(fx.authorId).classrooms;
      await api.addLesson({ courseId: id, title: "L1" });
      await api.addLesson({ courseId: id, title: "L2" });
      const { id: modA } = await api.addModule({ courseId: id, title: "A" }); // wraps L1, L2
      const { id: modB } = await api.addModule({ courseId: id, title: "B" }); // empty
      const lessons = await m.payload.find({
        collection: "lessons",
        where: { course: { equals: id } },
        sort: "order",
        depth: 0,
      });
      const [l1, l2] = lessons.docs;
      return { courseId: id, modA, modB, l1: l1!.id, l2: l2!.id };
    }
    const lessonState = async (lessonId: number) => {
      const l = await m.payload.findByID({
        collection: "lessons",
        id: lessonId,
        depth: 0,
      });
      return { module: (l.module as number | null) ?? null, order: l.order };
    };

    it("reorders lessons inside a flat course", async () => {
      const { id } = await createViaApi();
      const api = callerAs(fx.authorId).classrooms;
      const { id: a } = await api.addLesson({ courseId: id, title: "A" });
      const { id: b } = await api.addLesson({ courseId: id, title: "B" });
      await api.reorderLessons({
        courseId: id,
        moduleId: null,
        orderedIds: [b, a],
      });
      expect(await lessonState(b)).toEqual({ module: null, order: 0 });
      expect(await lessonState(a)).toEqual({ module: null, order: 1 });
    });

    it("moves a lesson into an empty module", async () => {
      const s = await seedModuled();
      await callerAs(fx.authorId).classrooms.reorderLessons({
        courseId: s.courseId,
        moduleId: s.modB,
        orderedIds: [s.l2],
      });
      expect(await lessonState(s.l2)).toEqual({ module: s.modB, order: 0 });
    });

    it("lets the last lesson leave a module (the module stays, empty)", async () => {
      const s = await seedModuled();
      const api = callerAs(fx.authorId).classrooms;
      await api.reorderLessons({
        courseId: s.courseId,
        moduleId: s.modB,
        orderedIds: [s.l1, s.l2],
      });
      expect(await lessonState(s.l1)).toEqual({ module: s.modB, order: 0 });
      expect(await lessonState(s.l2)).toEqual({ module: s.modB, order: 1 });
      const mods = await m.payload.find({
        collection: "modules",
        where: { course: { equals: s.courseId } },
        depth: 0,
      });
      expect(mods.totalDocs).toBe(2);
    });

    it("refuses an order that drops a lesson already in the module", async () => {
      const s = await seedModuled();
      await expect(
        callerAs(fx.authorId).classrooms.reorderLessons({
          courseId: s.courseId,
          moduleId: s.modA,
          orderedIds: [s.l2],
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "LESSON_SET_MISMATCH",
      });
    });

    it("refuses a null module on a moduled course and a module from another course", async () => {
      const s = await seedModuled();
      const other = await seedModuled();
      const api = callerAs(fx.authorId).classrooms;
      await expect(
        api.reorderLessons({
          courseId: s.courseId,
          moduleId: null,
          orderedIds: [s.l1, s.l2],
        }),
      ).rejects.toMatchObject({ message: "MODULE_COURSE_MISMATCH" });
      await expect(
        api.reorderLessons({
          courseId: s.courseId,
          moduleId: other.modA,
          orderedIds: [s.l1, s.l2],
        }),
      ).rejects.toMatchObject({ message: "MODULE_COURSE_MISMATCH" });
    });

    it("refuses another member", async () => {
      const s = await seedModuled();
      await expect(
        callerAs(fx.otherId).classrooms.reorderLessons({
          courseId: s.courseId,
          moduleId: s.modA,
          orderedIds: [s.l2, s.l1],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("adds a lesson to the chosen module, at its end", async () => {
      const s = await seedModuled();
      const { id } = await callerAs(fx.authorId).classrooms.addLesson({
        courseId: s.courseId,
        title: "New",
        moduleId: s.modA,
      });
      expect(await lessonState(id)).toEqual({ module: s.modA, order: 2 });
    });

    it("refuses a moduleId on a flat course", async () => {
      const { id } = await createViaApi();
      const other = await seedModuled();
      await expect(
        callerAs(fx.authorId).classrooms.addLesson({
          courseId: id,
          title: "X",
          moduleId: other.modA,
        }),
      ).rejects.toMatchObject({ message: "MODULE_COURSE_MISMATCH" });
    });
  });
});
