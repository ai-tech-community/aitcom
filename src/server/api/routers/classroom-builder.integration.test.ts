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
    await m.db.insert(m.schema.user).values(
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

    it("refuses to move an archived course back to draft", async () => {
      const { id } = await createViaApi();
      await m.payload.update({
        collection: "courses",
        id,
        data: { status: "archived" },
      });
      await expect(
        callerAs(fx.authorId).classrooms.update({
          courseId: id,
          status: "draft",
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "COURSE_ARCHIVED",
      });
    });

    it("refuses an update from another member", async () => {
      const { id } = await createViaApi();
      await expect(
        callerAs(fx.otherId).classrooms.update({
          courseId: id,
          title: "Not mine",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
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

    it("rejects an expectedUpdatedAt that is not a date as a bad request", async () => {
      const { id } = await createViaApi();
      await expect(
        callerAs(fx.authorId).classrooms.update({
          courseId: id,
          summary: "x",
          expectedUpdatedAt: "not-a-date",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
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

  describe("lesson saves", () => {
    it("returns updatedAt and refuses a stale lesson save", async () => {
      const { id: courseId } = await createViaApi();
      const api = callerAs(fx.authorId).classrooms;
      const { id } = await api.addLesson({ courseId, title: "L" });
      const before = await m.payload.findByID({
        collection: "lessons",
        id,
        depth: 0,
      });
      const saved = await api.updateLesson({
        lessonId: id,
        title: "L2",
        expectedUpdatedAt: before.updatedAt,
      });
      const after = await m.payload.findByID({
        collection: "lessons",
        id,
        depth: 0,
      });
      expect(saved.updatedAt).toBe(after.updatedAt);
      expect(saved.updatedAt).not.toBe(before.updatedAt);
      await expect(
        api.updateLesson({
          lessonId: id,
          title: "L3",
          expectedUpdatedAt: before.updatedAt,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT", message: "LESSON_CHANGED" });
      await expect(
        api.updateLesson({
          lessonId: id,
          title: "L3",
          expectedUpdatedAt: saved.updatedAt,
        }),
      ).resolves.toMatchObject({ ok: true });
    });

    it("rejects a lesson expectedUpdatedAt that is not a date as a bad request", async () => {
      const { id: courseId } = await createViaApi();
      const api = callerAs(fx.authorId).classrooms;
      const { id } = await api.addLesson({ courseId, title: "L" });
      await expect(
        api.updateLesson({
          lessonId: id,
          title: "x",
          expectedUpdatedAt: "not-a-date",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("refuses lesson changes on an archived course", async () => {
      const { id: courseId } = await createViaApi();
      const api = callerAs(fx.authorId).classrooms;
      const { id } = await api.addLesson({ courseId, title: "L" });
      await m.payload.update({
        collection: "courses",
        id: courseId,
        data: { status: "archived" },
      });
      const archived = { code: "FORBIDDEN", message: "COURSE_ARCHIVED" };
      await expect(
        api.updateLesson({ lessonId: id, title: "x" }),
      ).rejects.toMatchObject(archived);
      await expect(
        api.addLesson({ courseId, title: "y" }),
      ).rejects.toMatchObject(archived);
      await expect(
        api.deleteLesson({ lessonId: id }),
      ).rejects.toMatchObject(archived);
      await expect(
        api.reorderLessons({ courseId, moduleId: null, orderedIds: [id] }),
      ).rejects.toMatchObject(archived);
      const still = await m.payload.findByID({
        collection: "lessons",
        id,
        depth: 0,
      });
      expect(still.title).toBe("L");
    });
  });

  describe("lesson versions after outline changes", () => {
    /** The server's current version of each lesson, by id. */
    async function storedVersions(courseId: number) {
      const { docs } = await m.payload.find({
        collection: "lessons",
        where: { course: { equals: courseId } },
        pagination: false,
        depth: 0,
      });
      return new Map(docs.map((l) => [l.id, l.updatedAt]));
    }
    const byId = (lessons: { id: number; updatedAt: string }[]) =>
      new Map(lessons.map((l) => [l.id, l.updatedAt]));

    it("reorderLessons returns the new version of every lesson it rewrote", async () => {
      const { id: courseId } = await createViaApi();
      const api = callerAs(fx.authorId).classrooms;
      const { id: a } = await api.addLesson({ courseId, title: "A" });
      const { id: b } = await api.addLesson({ courseId, title: "B" });
      const result = await api.reorderLessons({
        courseId,
        moduleId: null,
        orderedIds: [b, a],
      });
      expect(result.ok).toBe(true);
      expect(byId(result.lessons)).toEqual(await storedVersions(courseId));
      // The returned version is accepted by the next lesson save.
      await expect(
        api.updateLesson({
          lessonId: a,
          title: "A2",
          expectedUpdatedAt: byId(result.lessons).get(a),
        }),
      ).resolves.toMatchObject({ ok: true });
    });

    it("addModule returns the lessons its first-module wrap rewrote, and none later", async () => {
      const { id: courseId } = await createViaApi();
      const api = callerAs(fx.authorId).classrooms;
      await api.addLesson({ courseId, title: "A" });
      await api.addLesson({ courseId, title: "B" });
      const first = await api.addModule({ courseId, title: "M1" });
      expect(typeof first.id).toBe("number");
      expect(byId(first.lessons)).toEqual(await storedVersions(courseId));
      const second = await api.addModule({ courseId, title: "M2" });
      expect(second.lessons).toEqual([]);
    });

    it("dissolveModules returns the new version of every lesson", async () => {
      const { id: courseId } = await createViaApi();
      const api = callerAs(fx.authorId).classrooms;
      await api.addLesson({ courseId, title: "A" });
      await api.addLesson({ courseId, title: "B" });
      await api.addModule({ courseId, title: "M1" });
      const result = await api.dissolveModules({ courseId });
      expect(result.ok).toBe(true);
      expect(result.lessons).toHaveLength(2);
      expect(byId(result.lessons)).toEqual(await storedVersions(courseId));
    });

    it("assignLessonToModule returns the moved lesson's new version", async () => {
      const { id: courseId } = await createViaApi();
      const api = callerAs(fx.authorId).classrooms;
      const { id: lessonId } = await api.addLesson({ courseId, title: "A" });
      await api.addModule({ courseId, title: "M1" });
      const { id: m2 } = await api.addModule({ courseId, title: "M2" });
      const result = await api.assignLessonToModule({
        lessonId,
        moduleId: m2,
      });
      expect(result.ok).toBe(true);
      expect(result.lessons).toEqual([
        { id: lessonId, updatedAt: (await storedVersions(courseId)).get(lessonId) },
      ]);
    });
  });

  describe("archived course", () => {
    it("refuses every module change", async () => {
      const { id: courseId } = await createViaApi();
      const api = callerAs(fx.authorId).classrooms;
      const { id: lessonId } = await api.addLesson({ courseId, title: "L" });
      const { id: moduleId } = await api.addModule({ courseId, title: "M" });
      await m.payload.update({
        collection: "courses",
        id: courseId,
        data: { status: "archived" },
      });
      const archived = { code: "FORBIDDEN", message: "COURSE_ARCHIVED" };
      await expect(
        api.addModule({ courseId, title: "M2" }),
      ).rejects.toMatchObject(archived);
      await expect(
        api.renameModule({ moduleId, title: "Renamed" }),
      ).rejects.toMatchObject(archived);
      await expect(
        api.reorderModules({ courseId, orderedIds: [moduleId] }),
      ).rejects.toMatchObject(archived);
      await expect(
        api.assignLessonToModule({ lessonId, moduleId }),
      ).rejects.toMatchObject(archived);
      await expect(api.deleteModule({ moduleId })).rejects.toMatchObject(
        archived,
      );
      await expect(api.dissolveModules({ courseId })).rejects.toMatchObject(
        archived,
      );
      const { docs: modules } = await m.payload.find({
        collection: "modules",
        where: { course: { equals: courseId } },
        depth: 0,
      });
      expect(modules.map((mod) => mod.title)).toEqual(["M"]);
    });
  });
});
