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

describe.skipIf(!RUN_DB)("classroom course access [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    payload: Awaited<
      ReturnType<typeof import("@/server/payload").getPayloadClient>
    >;
  };
  let m: Mods;

  type Fixture = {
    sfx: string;
    authorId: string;
    memberId: string;
    moderatorId: string;
    outsiderId: string;
    communityId: string;
    membersOnly: { id: number; slug: string; lessonId: number };
    publicCourse: { id: number; slug: string; lessonId: number };
    draft: { id: number; slug: string; lessonId: number };
  };
  let fx: Fixture;

  const EXAM = [
    {
      id: "q1",
      prompt: "2+2?",
      type: "single",
      options: ["3", "4"],
      correctIndex: 1,
    },
  ];

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

  async function createCourse(
    label: string,
    status: "draft" | "published",
    isPublic: boolean,
  ) {
    const course = await m.payload.create({
      collection: "courses",
      data: {
        title: `${label} ${fx.sfx}`,
        slug: `${label}-${fx.sfx}`,
        authorId: fx.authorId,
        authorName: "Author",
        status,
        communityId: fx.communityId,
        isPublic,
        enrollmentCount: 0,
      },
    });
    const lesson = await m.payload.create({
      collection: "lessons",
      data: {
        course: course.id,
        title: `${label} lesson`,
        order: 0,
        examQuestions: EXAM,
        examMandatory: false,
        examPassThreshold: 70,
        examMaxAttempts: 0,
      },
    });
    return { id: course.id, slug: course.slug, lessonId: lesson.id };
  }

  beforeEach(async () => {
    const { db, schema } = m;
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ids = {
      authorId: `ca-author-${sfx}`,
      memberId: `ca-member-${sfx}`,
      moderatorId: `ca-mod-${sfx}`,
      outsiderId: `ca-outsider-${sfx}`,
    };
    await db.insert(schema.user).values(
      Object.values(ids).map((id) => ({
        id,
        email: `${id}@example.test`,
        name: id,
      })),
    );
    const [community] = await db
      .insert(schema.communities)
      .values({
        name: `Access ${sfx}`,
        slug: `access-${sfx}`,
        createdBy: ids.authorId,
      })
      .returning();
    await db.insert(schema.communityMemberships).values([
      { communityId: community!.id, userId: ids.authorId, role: "member" },
      { communityId: community!.id, userId: ids.memberId, role: "member" },
      {
        communityId: community!.id,
        userId: ids.moderatorId,
        role: "moderator",
      },
    ]);
    fx = {
      sfx,
      ...ids,
      communityId: community!.id,
      membersOnly: { id: 0, slug: "", lessonId: 0 },
      publicCourse: { id: 0, slug: "", lessonId: 0 },
      draft: { id: 0, slug: "", lessonId: 0 },
    };
    fx.membersOnly = await createCourse("members-only", "published", false);
    fx.publicCourse = await createCourse("public", "published", true);
    fx.draft = await createCourse("draft", "draft", false);
  });

  afterEach(async () => {
    const { db, schema } = m;
    const { eq, inArray } = await import("drizzle-orm");
    const courseIds = [fx.membersOnly.id, fx.publicCourse.id, fx.draft.id];
    await db
      .delete(schema.lessonExamAttempts)
      .where(inArray(schema.lessonExamAttempts.courseId, courseIds));
    await db
      .delete(schema.lessonCompletions)
      .where(inArray(schema.lessonCompletions.courseId, courseIds));
    await db
      .delete(schema.courseCertificates)
      .where(inArray(schema.courseCertificates.courseId, courseIds));
    await db
      .delete(schema.courseEnrollments)
      .where(inArray(schema.courseEnrollments.courseId, courseIds));
    await m.payload.delete({
      collection: "lessons",
      where: { course: { in: courseIds } },
    });
    await m.payload.delete({
      collection: "courses",
      where: { id: { in: courseIds } },
    });
    await db
      .delete(schema.communityMemberships)
      .where(eq(schema.communityMemberships.communityId, fx.communityId));
    await db
      .delete(schema.communities)
      .where(eq(schema.communities.id, fx.communityId));
    const userIds = [fx.authorId, fx.memberId, fx.moderatorId, fx.outsiderId];
    // A passed course issues a certificate, which earns a badge: its row and
    // its notification reference user.id without cascade — remove them
    // before the users.
    await db
      .delete(schema.memberBadges)
      .where(inArray(schema.memberBadges.userId, userIds));
    await db
      .delete(schema.notifications)
      .where(inArray(schema.notifications.userId, userIds));
    for (const id of userIds) {
      await db.delete(schema.user).where(eq(schema.user.id, id));
    }
  });

  function callerAs(userId: string | null) {
    return m.createCaller({
      db: m.db,
      headers: new Headers(),
      session: userId ? ({ user: { id: userId }, session: {} } as never) : null,
    });
  }

  async function setMembershipStatus(
    userId: string,
    status: "active" | "banned",
  ) {
    const { and, eq } = await import("drizzle-orm");
    await m.db
      .update(m.schema.communityMemberships)
      .set({ status })
      .where(
        and(
          eq(m.schema.communityMemberships.communityId, fx.communityId),
          eq(m.schema.communityMemberships.userId, userId),
        ),
      );
  }

  describe("classrooms.get", () => {
    it("hides a members-only course from signed-out visitors and outsiders", async () => {
      for (const viewer of [null, fx.outsiderId]) {
        await expect(
          callerAs(viewer).classrooms.get({ slug: fx.membersOnly.slug }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    });

    it("hides a members-only course from a banned member", async () => {
      await setMembershipStatus(fx.memberId, "banned");
      await expect(
        callerAs(fx.memberId).classrooms.get({ slug: fx.membersOnly.slug }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("shows a members-only course to an active member", async () => {
      const res = await callerAs(fx.memberId).classrooms.get({
        slug: fx.membersOnly.slug,
      });
      expect(res.lessons.map((l) => l.id)).toEqual([fx.membersOnly.lessonId]);
    });

    it("shows a public course to signed-out visitors and outsiders", async () => {
      for (const viewer of [null, fx.outsiderId]) {
        const res = await callerAs(viewer).classrooms.get({
          slug: fx.publicCourse.slug,
        });
        expect(res.course.id).toBe(fx.publicCourse.id);
      }
    });

    it("hides a draft from members but shows it to the author and moderators", async () => {
      await expect(
        callerAs(fx.memberId).classrooms.get({ slug: fx.draft.slug }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      for (const viewer of [fx.authorId, fx.moderatorId]) {
        const res = await callerAs(viewer).classrooms.get({
          slug: fx.draft.slug,
        });
        expect(res.course.id).toBe(fx.draft.id);
      }
    });

    it("never sends the exam answer key to a moderator", async () => {
      const res = await callerAs(fx.moderatorId).classrooms.get({
        slug: fx.draft.slug,
      });
      for (const lesson of res.lessons) {
        expect(lesson.examQuestions).toBeUndefined();
      }
      expect(JSON.stringify(res)).not.toContain("correctIndex");
    });

    it("still sends the answer key to the author", async () => {
      const res = await callerAs(fx.authorId).classrooms.get({
        slug: fx.draft.slug,
      });
      expect(res.lessons[0]?.examQuestions).toEqual(EXAM);
    });

    it("hides every course of a soft-deleted community, even from the author", async () => {
      const { eq } = await import("drizzle-orm");
      await m.db
        .update(m.schema.communities)
        .set({ deletedAt: new Date() })
        .where(eq(m.schema.communities.id, fx.communityId));
      for (const viewer of [fx.authorId, fx.memberId, null]) {
        await expect(
          callerAs(viewer).classrooms.get({ slug: fx.publicCourse.slug }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    });
  });

  describe("classrooms.enroll", () => {
    it("refuses an outsider on a members-only course without revealing it", async () => {
      await expect(
        callerAs(fx.outsiderId).classrooms.enroll({
          courseId: fx.membersOnly.id,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("lets an outsider enroll in a public course", async () => {
      const res = await callerAs(fx.outsiderId).classrooms.enroll({
        courseId: fx.publicCourse.id,
      });
      expect(res).toEqual({ enrolled: true, already: false });
    });

    it("lets an active member enroll in a members-only course", async () => {
      const res = await callerAs(fx.memberId).classrooms.enroll({
        courseId: fx.membersOnly.id,
      });
      expect(res).toEqual({ enrolled: true, already: false });
    });
  });

  describe("learner actions after losing access", () => {
    beforeEach(async () => {
      await callerAs(fx.memberId).classrooms.enroll({
        courseId: fx.membersOnly.id,
      });
      await setMembershipStatus(fx.memberId, "banned");
    });

    it("refuses an exam attempt from a banned, still-enrolled member", async () => {
      await expect(
        callerAs(fx.memberId).classrooms.submitExamAttempt({
          lessonId: fx.membersOnly.lessonId,
          answers: [{ questionId: "q1", selectedIndex: 1 }],
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const { eq } = await import("drizzle-orm");
      const attempts = await m.db
        .select()
        .from(m.schema.lessonExamAttempts)
        .where(eq(m.schema.lessonExamAttempts.userId, fx.memberId));
      expect(attempts).toHaveLength(0);
    });

    it("refuses marking a lesson complete from a banned, still-enrolled member", async () => {
      await expect(
        callerAs(fx.memberId).classrooms.markLessonComplete({
          lessonId: fx.membersOnly.lessonId,
          completed: true,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("learner actions on a lesson that does not exist", () => {
    const missingLessonId = 2147483000;

    it("answers an exam attempt with NOT_FOUND, like a hidden course's lesson", async () => {
      await expect(
        callerAs(fx.outsiderId).classrooms.submitExamAttempt({
          lessonId: missingLessonId,
          answers: [{ questionId: "q1", selectedIndex: 1 }],
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("answers marking it complete with NOT_FOUND, like a hidden course's lesson", async () => {
      await expect(
        callerAs(fx.outsiderId).classrooms.markLessonComplete({
          lessonId: missingLessonId,
          completed: true,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("learner actions with access", () => {
    it("an active enrolled member can still pass an exam and complete lessons", async () => {
      const caller = callerAs(fx.memberId);
      await caller.classrooms.enroll({ courseId: fx.membersOnly.id });
      const res = await caller.classrooms.submitExamAttempt({
        lessonId: fx.membersOnly.lessonId,
        answers: [{ questionId: "q1", selectedIndex: 1 }],
      });
      expect(res.passed).toBe(true);
      const get = await caller.classrooms.get({ slug: fx.membersOnly.slug });
      expect(get.completedLessonIds).toEqual([fx.membersOnly.lessonId]);
    });
  });

  describe("classrooms.list", () => {
    async function slugsFor(viewer: string | null) {
      const { communities } = m.schema;
      const { eq } = await import("drizzle-orm");
      const [c] = await m.db
        .select({ slug: communities.slug })
        .from(communities)
        .where(eq(communities.id, fx.communityId));
      const res = await callerAs(viewer).classrooms.list({
        communitySlug: c!.slug,
      });
      return res.map((r) => r.slug).sort();
    }

    it("shows outsiders only public courses", async () => {
      expect(await slugsFor(fx.outsiderId)).toEqual([fx.publicCourse.slug]);
      expect(await slugsFor(null)).toEqual([fx.publicCourse.slug]);
    });

    it("shows members published courses but not others' drafts", async () => {
      expect(await slugsFor(fx.memberId)).toEqual(
        [fx.membersOnly.slug, fx.publicCourse.slug].sort(),
      );
    });

    it("shows the author their own draft", async () => {
      expect(await slugsFor(fx.authorId)).toEqual(
        [fx.draft.slug, fx.membersOnly.slug, fx.publicCourse.slug].sort(),
      );
    });

    it("shows moderators drafts too", async () => {
      expect(await slugsFor(fx.moderatorId)).toEqual(
        [fx.draft.slug, fx.membersOnly.slug, fx.publicCourse.slug].sort(),
      );
    });

    it("shows a banned member only public courses", async () => {
      await setMembershipStatus(fx.memberId, "banned");
      expect(await slugsFor(fx.memberId)).toEqual([fx.publicCourse.slug]);
    });
  });
});
