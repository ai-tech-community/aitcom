import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Where } from "payload";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { and, eq, isNull, inArray } from "drizzle-orm";
import type { db } from "@/server/db";
import {
  communities,
  communityMemberships,
  courseEnrollments,
  lessonCompletions,
  lessonExamAttempts,
  courseCertificates,
} from "@/server/db/schema";
import {
  canCreateCourse,
  courseProgressPercent,
  coursePassed,
  stripAnswerKey,
  gradeExam,
  examPassed,
  orderLessonsForReading,
  type CommunityRole,
  type ExamQuestion,
} from "@/lib/classroom";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";

/** Resolve community id + the caller's active role (null if not an active member). */
async function resolveCommunityAndRole(
  ctx: { db: typeof db; session: { user: { id: string } } | null },
  slug: string,
): Promise<{
  communityId: string;
  role: CommunityRole | null;
  classroomCreatePolicy: "all_members" | "admins_only";
}> {
  const community = await ctx.db.query.communities.findFirst({
    where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
    columns: { id: true, classroomCreatePolicy: true },
  });
  if (!community) throw new TRPCError({ code: "NOT_FOUND" });

  let role: CommunityRole | null = null;
  if (ctx.session?.user) {
    const membership = await ctx.db.query.communityMemberships.findFirst({
      where: and(
        eq(communityMemberships.communityId, community.id),
        eq(communityMemberships.userId, ctx.session.user.id),
        eq(communityMemberships.status, "active"),
      ),
    });
    role = (membership?.role as CommunityRole | undefined) ?? null;
  }

  return {
    communityId: community.id,
    role,
    classroomCreatePolicy: community.classroomCreatePolicy ?? "all_members",
  };
}

/** Issue a course certificate if (and only if) every lesson is now complete. Idempotent. */
async function issueCertificateIfComplete(
  database: typeof db,
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  courseId: number,
  userId: string,
): Promise<void> {
  const { totalDocs: totalLessons } = await payload.count({
    collection: "lessons",
    where: { course: { equals: courseId } },
  });
  if (totalLessons === 0) return;

  const completedRows = await database
    .select({ lessonId: lessonCompletions.lessonId })
    .from(lessonCompletions)
    .where(
      and(
        eq(lessonCompletions.courseId, courseId),
        eq(lessonCompletions.userId, userId),
      ),
    );
  if (completedRows.length < totalLessons) return;

  await database
    .insert(courseCertificates)
    .values({ courseId, userId })
    .onConflictDoNothing();
}

export const classroomsRouter = createTRPCRouter({
  /** List a community's published courses; members-only courses hidden from non-members. */
  list: publicProcedure
    .input(z.object({ communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const { communityId, role } = await resolveCommunityAndRole(
        ctx,
        input.communitySlug,
      );
      const payload = await getPayloadClient();
      const userId = ctx.session?.user?.id;

      // A course is listable if it is published-and-visible to the caller, OR
      // the caller is its author (so creators see their own drafts/archived).
      const visibility: Where[] = [
        role === null
          ? {
              and: [
                { status: { equals: "published" } },
                { isPublic: { equals: true } },
              ],
            }
          : { status: { equals: "published" } },
      ];
      if (userId) visibility.push({ authorId: { equals: userId } });

      const { docs } = await payload.find({
        collection: "courses",
        where: {
          and: [{ communityId: { equals: communityId } }, { or: visibility }],
        },
        sort: "-enrollmentCount",
        limit: 50,
        depth: 0,
      });

      const courseIds = docs.map((d) => d.id);
      if (courseIds.length === 0) {
        return docs.map((c) => ({ ...c, progressPercent: 0 }));
      }

      if (!userId) {
        return docs.map((c) => ({ ...c, progressPercent: 0 }));
      }

      // Per-course progress for the logged-in user, in 2 queries total
      // (lesson totals + the caller's completions), not N per course.
      const { docs: allLessons } = await payload.find({
        collection: "lessons",
        where: { course: { in: courseIds } },
        limit: 1000,
        depth: 0,
      });
      const totals = new Map<number, number>();
      for (const l of allLessons) {
        const cid = l.course;
        totals.set(cid, (totals.get(cid) ?? 0) + 1);
      }

      const completionRows = await ctx.db
        .select({ courseId: lessonCompletions.courseId })
        .from(lessonCompletions)
        .where(
          and(
            inArray(lessonCompletions.courseId, courseIds),
            eq(lessonCompletions.userId, userId),
          ),
        );
      const completed = new Map<number, number>();
      for (const r of completionRows) {
        completed.set(r.courseId, (completed.get(r.courseId) ?? 0) + 1);
      }

      return docs.map((c) => ({
        ...c,
        progressPercent: courseProgressPercent(
          completed.get(c.id) ?? 0,
          totals.get(c.id) ?? 0,
        ),
      }));
    }),

  /** A single course with its lessons (ordered) and the caller's enrollment/progress. */
  get: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const { docs } = await payload.find({
        collection: "courses",
        where: { slug: { equals: input.slug } },
        limit: 1,
        depth: 0,
      });
      const course = docs[0];
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });

      const userId = ctx.session?.user?.id;

      // Drafts/archived are visible only to the author.
      if (course.status !== "published" && course.authorId !== userId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { docs: rawLessons } = await payload.find({
        collection: "lessons",
        where: { course: { equals: course.id } },
        limit: 200,
        depth: 0,
      });
      const { docs: modules } = await payload.find({
        collection: "modules",
        where: { course: { equals: course.id } },
        sort: "order",
        limit: 1000,
        depth: 0,
      });
      const moduleRefs = modules.map((m) => ({
        id: m.id,
        title: m.title,
        order: m.order ?? 0,
        summary: m.summary ?? null,
      }));
      const lessons = orderLessonsForReading(
        rawLessons.map((l) => ({ ...l, module: l.module ?? null, order: l.order ?? 0 })),
        moduleRefs,
      );

      let enrolled = false;
      let completedLessonIds: number[] = [];
      if (userId) {
        const enrollment = await ctx.db
          .select({ id: courseEnrollments.id })
          .from(courseEnrollments)
          .where(
            and(
              eq(courseEnrollments.courseId, course.id),
              eq(courseEnrollments.userId, userId),
            ),
          )
          .limit(1);
        enrolled = enrollment.length > 0;

        const completions = await ctx.db
          .select({ lessonId: lessonCompletions.lessonId })
          .from(lessonCompletions)
          .where(
            and(
              eq(lessonCompletions.courseId, course.id),
              eq(lessonCompletions.userId, userId),
            ),
          );
        completedLessonIds = completions.map((c) => c.lessonId);
      }

      // Public per-lesson exam summary — NEVER includes correctIndex.
      const lessonExams = lessons.map((l) => {
        const questions = (l.examQuestions ?? []) as ExamQuestion[];
        const hasExam = questions.length > 0;
        return {
          lessonId: l.id,
          hasExam,
          mandatory: hasExam && l.examMandatory === true,
          passThreshold: l.examPassThreshold ?? 70,
          maxAttempts: l.examMaxAttempts ?? 0,
          questionCount: questions.length,
          questions: hasExam ? stripAnswerKey(questions) : [],
        };
      });

      let attempts: {
        lessonId: number;
        score: number;
        passed: boolean;
        attemptedAt: Date;
      }[] = [];
      let certificateIssuedAt: Date | null = null;
      if (userId) {
        const rows = await ctx.db
          .select({
            lessonId: lessonExamAttempts.lessonId,
            score: lessonExamAttempts.score,
            passed: lessonExamAttempts.passed,
            attemptedAt: lessonExamAttempts.attemptedAt,
          })
          .from(lessonExamAttempts)
          .where(
            and(
              eq(lessonExamAttempts.courseId, course.id),
              eq(lessonExamAttempts.userId, userId),
            ),
          );
        attempts = rows;

        const cert = await ctx.db
          .select({ issuedAt: courseCertificates.issuedAt })
          .from(courseCertificates)
          .where(
            and(
              eq(courseCertificates.courseId, course.id),
              eq(courseCertificates.userId, userId),
            ),
          )
          .limit(1);
        certificateIssuedAt = cert[0]?.issuedAt ?? null;
      }

      const passedCourse = coursePassed(
        completedLessonIds.length,
        lessons.length,
      );

      // The raw lesson docs carry examQuestions WITH the answer key. Only the
      // author (who edits the exam) may receive it; everyone else gets the
      // key-stripped lessonExams and must never see correctIndex over the wire.
      const isAuthor = !!userId && course.authorId === userId;
      const safeLessons = isAuthor
        ? lessons
        : lessons.map((l) => ({ ...l, examQuestions: undefined }));

      return {
        course,
        lessons: safeLessons,
        modules: moduleRefs,
        enrolled,
        completedLessonIds,
        lessonExams,
        attempts,
        certificateIssuedAt,
        passedCourse,
      };
    }),

  /** Create a course (active member; honors classroomCreatePolicy). */
  create: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        title: z.string().min(3).max(200),
        summary: z.string().max(500).optional(),
        status: z.enum(["draft", "published"]).default("published"),
        coverImageUrl: z.string().url().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { communityId, role, classroomCreatePolicy } =
        await resolveCommunityAndRole(ctx, input.communitySlug);

      if (!canCreateCourse(classroomCreatePolicy, role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "CANNOT_CREATE_COURSE",
        });
      }

      const payload = await getPayloadClient();

      const base = input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
      const slug = `${base}-${Date.now()}`;

      const course = await payload.create({
        collection: "courses",
        data: {
          title: input.title,
          slug,
          summary: input.summary ?? undefined,
          coverImageUrl: input.coverImageUrl ?? undefined,
          authorId: ctx.session.user.id,
          authorName: ctx.session.user.name ?? "member",
          status: input.status,
          communityId,
          isPublic: false,
          enrollmentCount: 0,
        },
      });

      if (input.status === "published") {
        await logActivity(ctx.db, {
          actorId: ctx.session.user.id,
          actorType: "member",
          action: "course.published",
          targetType: "courses",
          targetId: String(course.id),
          communityId,
          metadata: { title: input.title },
        });
      }

      return { id: course.id, slug };
    }),

  /** Update own course (title/summary/status draft|published|archived). */
  update: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        title: z.string().min(3).max(200).optional(),
        summary: z.string().max(500).optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
        coverImageUrl: z.string().url().max(1000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const course = await payload.findByID({
        collection: "courses",
        id: input.courseId,
        depth: 0,
      });

      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.summary !== undefined) data.summary = input.summary;
      if (input.status !== undefined) data.status = input.status;
      if (input.coverImageUrl !== undefined)
        data.coverImageUrl = input.coverImageUrl;

      await payload.update({
        collection: "courses",
        id: input.courseId,
        data,
      });

      return { ok: true };
    }),

  /** Add a lesson to own course. body is lexical editorState JSON. */
  addLesson: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        title: z.string().min(1).max(200),
        youtubeUrl: z.string().url().max(500).optional(),
        body: z.any().optional(),
        resources: z
          .array(
            z.object({
              label: z.string().min(1).max(120),
              url: z.string().url().max(500),
            }),
          )
          .max(20)
          .default([]),
        examMandatory: z.boolean().optional(),
        examPassThreshold: z.number().min(0).max(100).optional(),
        examMaxAttempts: z.number().min(0).optional(),
        examQuestions: z
          .array(
            z.object({
              id: z.string(),
              prompt: z.string(),
              type: z.enum(["single", "boolean"]),
              options: z.array(z.string()),
              correctIndex: z.number().int(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const course = await payload.findByID({
        collection: "courses",
        id: input.courseId,
        depth: 0,
      });

      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Keep the flat-or-fully-moduled invariant: if the course is moduled,
      // a new lesson must land in a module (never null). Default to the last
      // module; the author can reassign it via assignLessonToModule.
      const { docs: courseModules } = await payload.find({
        collection: "modules",
        where: { course: { equals: input.courseId } },
        sort: "-order",
        limit: 1,
        depth: 0,
      });
      const targetModuleId = courseModules[0]?.id ?? null;

      let lessonOrder: number;
      if (targetModuleId !== null) {
        // Moduled course: order within the target module
        const { totalDocs: moduleLessonCount } = await payload.find({
          collection: "lessons",
          where: { module: { equals: targetModuleId } },
          limit: 0,
          depth: 0,
        });
        lessonOrder = moduleLessonCount;
      } else {
        // Flat course: order across all lessons in the course
        const { totalDocs } = await payload.find({
          collection: "lessons",
          where: { course: { equals: input.courseId } },
          limit: 0,
          depth: 0,
        });
        lessonOrder = totalDocs;
      }

      const lesson = await payload.create({
        collection: "lessons",
        data: {
          course: input.courseId,
          title: input.title,
          order: lessonOrder,
          ...(targetModuleId !== null ? { module: targetModuleId } : {}),
          youtubeUrl: input.youtubeUrl ?? undefined,
          body: input.body ?? undefined,
          resources: input.resources,
          ...(input.examMandatory !== undefined
            ? { examMandatory: input.examMandatory }
            : {}),
          ...(input.examPassThreshold !== undefined
            ? { examPassThreshold: input.examPassThreshold }
            : {}),
          ...(input.examMaxAttempts !== undefined
            ? { examMaxAttempts: input.examMaxAttempts }
            : {}),
          ...(input.examQuestions !== undefined
            ? { examQuestions: input.examQuestions }
            : {}),
        },
      });

      return { id: lesson.id };
    }),

  /** Update a lesson on own course. */
  updateLesson: protectedProcedure
    .input(
      z.object({
        lessonId: z.number(),
        title: z.string().min(1).max(200).optional(),
        youtubeUrl: z.string().url().max(500).nullable().optional(),
        body: z.any().optional(),
        order: z.number().optional(),
        resources: z
          .array(
            z.object({
              label: z.string().min(1).max(120),
              url: z.string().url().max(500),
            }),
          )
          .max(20)
          .optional(),
        examMandatory: z.boolean().optional(),
        examPassThreshold: z.number().min(0).max(100).optional(),
        examMaxAttempts: z.number().min(0).optional(),
        examQuestions: z
          .array(
            z.object({
              id: z.string(),
              prompt: z.string(),
              type: z.enum(["single", "boolean"]),
              options: z.array(z.string()),
              correctIndex: z.number().int(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const lesson = await payload.findByID({
        collection: "lessons",
        id: input.lessonId,
        depth: 0,
      });

      const course = await payload.findByID({
        collection: "courses",
        id: lesson.course,
        depth: 0,
      });

      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.youtubeUrl !== undefined)
        data.youtubeUrl = input.youtubeUrl ?? undefined;
      if (input.body !== undefined) data.body = input.body;
      if (input.order !== undefined) data.order = input.order;
      if (input.resources !== undefined) data.resources = input.resources;
      if (input.examMandatory !== undefined)
        data.examMandatory = input.examMandatory;
      if (input.examPassThreshold !== undefined)
        data.examPassThreshold = input.examPassThreshold;
      if (input.examMaxAttempts !== undefined)
        data.examMaxAttempts = input.examMaxAttempts;
      if (input.examQuestions !== undefined)
        data.examQuestions = input.examQuestions;

      await payload.update({
        collection: "lessons",
        id: input.lessonId,
        data,
      });

      return { ok: true };
    }),

  /** Delete a lesson on own course. */
  deleteLesson: protectedProcedure
    .input(z.object({ lessonId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const lesson = await payload.findByID({
        collection: "lessons",
        id: input.lessonId,
        depth: 0,
      });

      const course = await payload.findByID({
        collection: "courses",
        id: lesson.course,
        depth: 0,
      });

      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await payload.delete({
        collection: "lessons",
        id: input.lessonId,
      });

      return { ok: true };
    }),

  /**
   * Create a module on own course. Creating the FIRST module auto-wraps every
   * existing flat lesson into it, so the course goes flat → fully-moduled in one
   * step (the wrap runs immediately after creation, keeping the course fully-moduled).
   * Later modules start empty.
   */
  addModule: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        title: z.string().min(1).max(200),
        summary: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const course = await payload.findByID({
        collection: "courses",
        id: input.courseId,
        depth: 0,
      });
      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { totalDocs: moduleCount } = await payload.find({
        collection: "modules",
        where: { course: { equals: input.courseId } },
        limit: 0,
        depth: 0,
      });

      const moduleDoc = await payload.create({
        collection: "modules",
        data: {
          course: input.courseId,
          title: input.title,
          order: moduleCount,
          summary: input.summary ?? undefined,
        },
      });

      // First module on a flat course: wrap all existing lessons into it,
      // preserving their order. A single bulk update (one SQL statement, so
      // atomic) — never a partial loop that could leave the course mixed.
      if (moduleCount === 0) {
        await payload.update({
          collection: "lessons",
          where: { course: { equals: input.courseId } },
          data: { module: moduleDoc.id },
        });
      }

      return { id: moduleDoc.id };
    }),

  /** Rename / re-summarise a module on own course. */
  renameModule: protectedProcedure
    .input(
      z.object({
        moduleId: z.number(),
        title: z.string().min(1).max(200).optional(),
        summary: z.string().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const moduleDoc = await payload.findByID({
        collection: "modules",
        id: input.moduleId,
        depth: 0,
      });
      const course = await payload.findByID({
        collection: "courses",
        id: moduleDoc.course,
        depth: 0,
      });
      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.summary !== undefined) data.summary = input.summary ?? undefined;

      await payload.update({
        collection: "modules",
        id: input.moduleId,
        data,
      });
      return { ok: true };
    }),

  /** Reorder a course's modules. orderedIds must be exactly that course's modules. */
  reorderModules: protectedProcedure
    .input(z.object({ courseId: z.number(), orderedIds: z.array(z.number()) }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const course = await payload.findByID({
        collection: "courses",
        id: input.courseId,
        depth: 0,
      });
      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { docs: modules } = await payload.find({
        collection: "modules",
        where: { course: { equals: input.courseId } },
        limit: 1000,
        depth: 0,
      });
      const validIds = new Set(modules.map((m) => m.id));
      if (
        input.orderedIds.length !== modules.length ||
        !input.orderedIds.every((id) => validIds.has(id))
      ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "MODULE_SET_MISMATCH" });
      }

      for (let i = 0; i < input.orderedIds.length; i++) {
        await payload.update({
          collection: "modules",
          id: input.orderedIds[i]!,
          data: { order: i },
        });
      }
      return { ok: true };
    }),

  /**
   * Move a lesson into a module of the same course. moduleId is never null here
   * — the only way back to flat is dissolveModules — so a moduled course stays
   * fully moduled. The lesson is appended to the end of the target module.
   */
  assignLessonToModule: protectedProcedure
    .input(z.object({ lessonId: z.number(), moduleId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const lesson = await payload.findByID({
        collection: "lessons",
        id: input.lessonId,
        depth: 0,
      });
      const course = await payload.findByID({
        collection: "courses",
        id: lesson.course,
        depth: 0,
      });
      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const moduleDoc = await payload.findByID({
        collection: "modules",
        id: input.moduleId,
        depth: 0,
      });
      if (moduleDoc.course !== lesson.course) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "MODULE_COURSE_MISMATCH" });
      }

      const { totalDocs: targetCount } = await payload.find({
        collection: "lessons",
        where: {
          and: [
            { course: { equals: lesson.course } },
            { module: { equals: input.moduleId } },
          ],
        },
        limit: 0,
        depth: 0,
      });

      await payload.update({
        collection: "lessons",
        id: input.lessonId,
        data: { module: input.moduleId, order: targetCount },
      });
      return { ok: true };
    }),

  /** Delete a module — only when empty (move its lessons out first). */
  deleteModule: protectedProcedure
    .input(z.object({ moduleId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const moduleDoc = await payload.findByID({
        collection: "modules",
        id: input.moduleId,
        depth: 0,
      });
      const course = await payload.findByID({
        collection: "courses",
        id: moduleDoc.course,
        depth: 0,
      });
      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { totalDocs: lessonCount } = await payload.find({
        collection: "lessons",
        where: { module: { equals: input.moduleId } },
        limit: 0,
        depth: 0,
      });
      if (lessonCount > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "MODULE_NOT_EMPTY" });
      }

      await payload.delete({ collection: "modules", id: input.moduleId });
      return { ok: true };
    }),

  /**
   * Revert a course to flat: null every lesson's module, then delete all the
   * course's modules. The only sanctioned moduled → flat path.
   */
  dissolveModules: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const course = await payload.findByID({
        collection: "courses",
        id: input.courseId,
        depth: 0,
      });
      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Null every lesson's module in one bulk update (atomic), then delete the
      // modules — so the course never lingers in a partially-dissolved state.
      await payload.update({
        collection: "lessons",
        where: { course: { equals: input.courseId } },
        data: { module: null },
      });

      const { docs: modules } = await payload.find({
        collection: "modules",
        where: { course: { equals: input.courseId } },
        limit: 1000,
        depth: 0,
      });
      for (const m of modules) {
        await payload.delete({ collection: "modules", id: m.id });
      }
      return { ok: true };
    }),

  /** Enroll the caller in a published course; awards the author enrollment XP. */
  enroll: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ctx.db
        .select()
        .from(courseEnrollments)
        .where(
          and(
            eq(courseEnrollments.courseId, input.courseId),
            eq(courseEnrollments.userId, userId),
          ),
        )
        .limit(1);
      if (existing.length > 0) return { enrolled: true, already: true };

      const payload = await getPayloadClient();
      const course = await payload.findByID({
        collection: "courses",
        id: input.courseId,
        depth: 0,
      });
      if (course.status !== "published")
        throw new TRPCError({ code: "FORBIDDEN", message: "NOT_PUBLISHED" });

      await ctx.db
        .insert(courseEnrollments)
        .values({ courseId: input.courseId, userId });
      await payload.update({
        collection: "courses",
        id: input.courseId,
        data: { enrollmentCount: (course.enrollmentCount ?? 0) + 1 },
      });
      if (course.authorId !== userId) {
        await awardXp(
          ctx.db,
          course.authorId,
          XP_AMOUNTS.COURSE_RECEIVE_ENROLLMENT,
        );
      }
      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "course.enroll",
        targetType: "courses",
        targetId: String(input.courseId),
        communityId: course.communityId ?? undefined,
        recipientId: course.authorId ?? undefined,
        metadata: { title: course.title },
      });
      return { enrolled: true, already: false };
    }),

  /** Unenroll the caller; does NOT claw back author XP (mirrors launchpad vote). */
  unenroll: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ctx.db
        .select()
        .from(courseEnrollments)
        .where(
          and(
            eq(courseEnrollments.courseId, input.courseId),
            eq(courseEnrollments.userId, userId),
          ),
        )
        .limit(1);
      if (existing.length === 0) return { enrolled: false };
      await ctx.db
        .delete(courseEnrollments)
        .where(
          and(
            eq(courseEnrollments.courseId, input.courseId),
            eq(courseEnrollments.userId, userId),
          ),
        );
      const payload = await getPayloadClient();
      const course = await payload.findByID({
        collection: "courses",
        id: input.courseId,
        depth: 0,
      });
      await payload.update({
        collection: "courses",
        id: input.courseId,
        data: {
          enrollmentCount: Math.max(0, (course.enrollmentCount ?? 0) - 1),
        },
      });
      return { enrolled: false };
    }),

  /** Toggle a lesson's completion for the caller (enrolled-only; no XP). */
  /** Grade an exam attempt server-side; on pass, complete the lesson + maybe certify. */
  submitExamAttempt: protectedProcedure
    .input(
      z.object({
        lessonId: z.number(),
        answers: z.array(
          z.object({ questionId: z.string(), selectedIndex: z.number().int() }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const payload = await getPayloadClient();
      const lesson = await payload.findByID({
        collection: "lessons",
        id: input.lessonId,
        depth: 0,
      });
      const courseId = lesson.course;

      const questions = (lesson.examQuestions ?? []) as ExamQuestion[];
      if (questions.length === 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "NO_EXAM" });

      // Enrolled-only, mirroring markLessonComplete.
      const enr = await ctx.db
        .select({ id: courseEnrollments.id })
        .from(courseEnrollments)
        .where(
          and(
            eq(courseEnrollments.courseId, courseId),
            eq(courseEnrollments.userId, userId),
          ),
        )
        .limit(1);
      if (enr.length === 0)
        throw new TRPCError({ code: "FORBIDDEN", message: "NOT_ENROLLED" });

      // Existing attempts: enforce the cap, and detect a sticky prior pass.
      const prior = await ctx.db
        .select({ passed: lessonExamAttempts.passed })
        .from(lessonExamAttempts)
        .where(
          and(
            eq(lessonExamAttempts.lessonId, input.lessonId),
            eq(lessonExamAttempts.userId, userId),
          ),
        );
      const alreadyPassed = prior.some((p) => p.passed);
      const maxAttempts = lesson.examMaxAttempts ?? 0;
      if (!alreadyPassed && maxAttempts > 0 && prior.length >= maxAttempts)
        throw new TRPCError({ code: "FORBIDDEN", message: "NO_ATTEMPTS_LEFT" });

      const threshold = lesson.examPassThreshold ?? 70;
      const { score, wrongQuestionIds } = gradeExam(questions, input.answers);
      const passed = examPassed(score, threshold);

      await ctx.db.insert(lessonExamAttempts).values({
        lessonId: input.lessonId,
        courseId,
        userId,
        score,
        thresholdAtAttempt: threshold,
        passed,
        answers: input.answers,
      });

      // A pass completes the lesson (idempotent); never un-complete on a later fail.
      if (passed) {
        await ctx.db
          .insert(lessonCompletions)
          .values({ lessonId: input.lessonId, courseId, userId })
          .onConflictDoNothing();
        await issueCertificateIfComplete(ctx.db, payload, courseId, userId);
      }

      return { score, passed, wrongQuestionIds };
    }),

  markLessonComplete: protectedProcedure
    .input(z.object({ lessonId: z.number(), completed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const payload = await getPayloadClient();
      const lesson = await payload.findByID({
        collection: "lessons",
        id: input.lessonId,
        depth: 0,
      });
      const courseId = lesson.course;

      const examQuestions = (lesson.examQuestions ?? []) as ExamQuestion[];
      const mandatoryExam =
        examQuestions.length > 0 && lesson.examMandatory === true;
      if (input.completed && mandatoryExam)
        throw new TRPCError({ code: "FORBIDDEN", message: "EXAM_REQUIRED" });

      const enr = await ctx.db
        .select()
        .from(courseEnrollments)
        .where(
          and(
            eq(courseEnrollments.courseId, courseId),
            eq(courseEnrollments.userId, userId),
          ),
        )
        .limit(1);
      if (enr.length === 0)
        throw new TRPCError({ code: "FORBIDDEN", message: "NOT_ENROLLED" });

      const existing = await ctx.db
        .select()
        .from(lessonCompletions)
        .where(
          and(
            eq(lessonCompletions.lessonId, input.lessonId),
            eq(lessonCompletions.userId, userId),
          ),
        )
        .limit(1);
      if (input.completed && existing.length === 0) {
        await ctx.db
          .insert(lessonCompletions)
          .values({ lessonId: input.lessonId, courseId, userId });
        await issueCertificateIfComplete(ctx.db, payload, courseId, userId);
      } else if (!input.completed && existing.length > 0) {
        await ctx.db
          .delete(lessonCompletions)
          .where(
            and(
              eq(lessonCompletions.lessonId, input.lessonId),
              eq(lessonCompletions.userId, userId),
            ),
          );
      }
      return { completed: input.completed };
    }),

  /** Set a course's public visibility (community owner/admin/moderator). */
  setPublic: protectedProcedure
    .input(z.object({ courseId: z.number(), isPublic: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const course = await payload.findByID({
        collection: "courses",
        id: input.courseId,
        depth: 0,
      });
      const m = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, course.communityId),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (
        !m ||
        (m.role !== "owner" && m.role !== "admin" && m.role !== "moderator")
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await payload.update({
        collection: "courses",
        id: input.courseId,
        data: { isPublic: input.isPublic },
      });
      return { ok: true };
    }),

  /** Archive a course (author OR community owner/admin/moderator). */
  moderateArchive: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const course = await payload.findByID({
        collection: "courses",
        id: input.courseId,
        depth: 0,
      });
      const isAuthor = course.authorId === ctx.session.user.id;
      let allowed = isAuthor;
      if (!allowed) {
        const m = await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, course.communityId),
            eq(communityMemberships.userId, ctx.session.user.id),
            eq(communityMemberships.status, "active"),
          ),
        });
        allowed =
          !!m &&
          (m.role === "owner" || m.role === "admin" || m.role === "moderator");
      }
      if (!allowed) throw new TRPCError({ code: "FORBIDDEN" });
      await payload.update({
        collection: "courses",
        id: input.courseId,
        data: { status: "archived" },
      });
      return { ok: true };
    }),
});
