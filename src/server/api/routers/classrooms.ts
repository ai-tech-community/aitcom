import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Where } from "payload";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import {
  assertCourseEditable,
  isCourseManagerRole,
  loadCourseAccess,
  requireReadableCourse,
  resolveCourseAccess,
} from "@/server/classroom/course-access";
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
import { awardXp, awardBadge, XP_AMOUNTS } from "@/lib/gamification";
import { invalidEmbedUrls } from "@/lib/classroom/lesson-body";
import { mayUploadMaterials } from "@/server/classroom/hosted-files";
import {
  assertLessonMaterials,
  loadMaterialsManifest,
} from "@/server/classroom/lesson-materials";
import { canPublish, publishChecks } from "@/lib/classroom/publish-checklist";
import { isResourceUrl } from "@/lib/classroom/resource-url";
import { COURSE_TITLE_MIN } from "@/lib/classroom/course-title";

/** One lesson resource link; the URL rule is shared with the builder. */
const resourceSchema = z.object({
  label: z.string().min(1).max(120),
  url: z.string().refine(isResourceUrl),
});

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

/** A Payload relationship read at depth 0 is an id, but its type admits the populated doc. */
function relationId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return (value as { id: number }).id;
  return value as number;
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

  const [certificate] = await database
    .insert(courseCertificates)
    .values({ courseId, userId })
    .onConflictDoNothing()
    .returning();

  // Only on first completion (certificate newly issued): award the graduate
  // badge + XP. awardBadge is idempotent; awardXp is not, so it must be gated
  // on the newly-issued certificate to avoid double-awarding on re-checks.
  if (certificate) {
    await awardBadge(database, userId, "course_complete");
    await awardXp(
      database,
      userId,
      XP_AMOUNTS.COURSE_COMPLETE,
      "course.complete",
    );
  }
}

/**
 * A lesson's version after a write. Outline changes (reorder, module wrap,
 * dissolve, move) rewrite lessons, and Payload stamps a new updatedAt on each;
 * returning the new versions lets an editor that has one of those lessons
 * open keep saving it without being refused as stale (LESSON_CHANGED).
 */
type LessonVersion = { id: number; updatedAt: string };

function lessonVersions(
  docs: readonly { id: number; updatedAt: string }[],
): LessonVersion[] {
  return docs.map((doc) => ({ id: doc.id, updatedAt: doc.updatedAt }));
}

/**
 * A course goes live only when every blocking publish check passes — the same
 * rules the builder's publish dialog shows, so an old tab or a direct API
 * call cannot publish an empty course.
 */
async function assertPublishable(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  course: { id: number; title: string; coverImageUrl?: string | null },
): Promise<void> {
  const [{ docs: lessons }, { docs: modules }] = await Promise.all([
    payload.find({
      collection: "lessons",
      where: { course: { equals: course.id } },
      pagination: false,
      depth: 0,
    }),
    payload.find({
      collection: "modules",
      where: { course: { equals: course.id } },
      pagination: false,
      depth: 0,
    }),
  ]);
  const checks = publishChecks({
    title: course.title,
    coverImageUrl: course.coverImageUrl ?? null,
    lessons: lessons.map((l) => ({
      id: l.id,
      title: l.title,
      module: relationId(l.module),
      body: l.body,
      resources: l.resources,
      examQuestions: l.examQuestions,
    })),
    modules: modules.map((mod) => ({ id: mod.id, title: mod.title })),
  });
  if (!canPublish(checks)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "PUBLISH_CHECKS_FAILED",
    });
  }
}

/** Every Embed block in a lesson body must resolve to a known provider. */
function assertLessonBodyEmbeds(body: unknown): void {
  if (body === undefined || body === null) return;
  if (invalidEmbedUrls(body).length > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_EMBED" });
  }
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

      // The database query narrows candidates (so the 50-row page isn't
      // filled with courses the caller can't see); the access policy is the
      // authority on what is actually returned.
      const candidates: Where[] = isCourseManagerRole(role)
        ? [{ status: { exists: true } }]
        : [
            role === null
              ? {
                  and: [
                    { status: { equals: "published" } },
                    { isPublic: { equals: true } },
                  ],
                }
              : { status: { equals: "published" } },
          ];
      if (userId) candidates.push({ authorId: { equals: userId } });

      const { docs: found } = await payload.find({
        collection: "courses",
        where: {
          and: [{ communityId: { equals: communityId } }, { or: candidates }],
        },
        sort: "-enrollmentCount",
        limit: 50,
        depth: 0,
      });
      const membership = role === null ? null : { role, active: true };
      const docs = found.filter(
        (c) =>
          resolveCourseAccess({
            course: c,
            viewerId: userId ?? null,
            membership,
          }) !== "none",
      );

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

      // One policy decides who may read a course (members-only, public,
      // drafts). `none` must not reveal that the course exists.
      const access = await loadCourseAccess(ctx.db, course, userId ?? null);
      if (access === "none") throw new TRPCError({ code: "NOT_FOUND" });

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
        rawLessons.map((l) => ({
          ...l,
          module: l.module ?? null,
          order: l.order ?? 0,
        })),
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

      // Hosted files used by any lesson, as this viewer may see them. No
      // links here: a file card asks for one only when it is used.
      const materials = await loadMaterialsManifest(payload, {
        courseId: course.id,
        bodies: lessons.map((l) => l.body),
        viewer: access,
      });
      const viewerCanUpload =
        userId && isAuthor
          ? await mayUploadMaterials(ctx.db, course.communityId, userId)
          : false;

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
        materials,
        viewerCanUpload,
      };
    }),

  /** Create a course (active member; honors classroomCreatePolicy). */
  create: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        title: z.string().min(COURSE_TITLE_MIN).max(200),
        summary: z.string().max(500).optional(),
        status: z.enum(["draft", "published"]).default("draft"),
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

  /**
   * Update own course. Status moves only between draft and published —
   * archiving is a moderator action (moderateArchive), and an archived course
   * cannot be moved back by its author. expectedUpdatedAt makes a save from a
   * stale tab fail loudly instead of overwriting newer edits.
   */
  update: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        title: z.string().min(COURSE_TITLE_MIN).max(200).optional(),
        summary: z.string().max(500).optional(),
        status: z.enum(["draft", "published"]).optional(),
        coverImageUrl: z.string().url().max(1000).nullable().optional(),
        expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
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

      if (
        input.expectedUpdatedAt !== undefined &&
        new Date(input.expectedUpdatedAt).getTime() !==
          new Date(course.updatedAt).getTime()
      ) {
        throw new TRPCError({ code: "CONFLICT", message: "COURSE_CHANGED" });
      }

      const statusChanges =
        input.status !== undefined && input.status !== course.status;
      if (statusChanges && course.status === "archived") {
        throw new TRPCError({ code: "FORBIDDEN", message: "COURSE_ARCHIVED" });
      }
      if (statusChanges && input.status === "published") {
        await assertPublishable(payload, {
          id: course.id,
          title: input.title ?? course.title,
          coverImageUrl:
            input.coverImageUrl !== undefined
              ? input.coverImageUrl
              : course.coverImageUrl,
        });
      }

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.summary !== undefined) data.summary = input.summary;
      if (statusChanges) data.status = input.status;
      if (input.coverImageUrl !== undefined)
        data.coverImageUrl = input.coverImageUrl;

      const updated = await payload.update({
        collection: "courses",
        id: input.courseId,
        data,
      });

      if (statusChanges && input.status === "published") {
        await logActivity(ctx.db, {
          actorId: ctx.session.user.id,
          actorType: "member",
          action: "course.published",
          targetType: "courses",
          targetId: String(course.id),
          communityId: course.communityId,
          metadata: { title: updated.title },
        });
      }

      return { ok: true as const, updatedAt: updated.updatedAt };
    }),

  /** Add a lesson to own course. body is lexical editorState JSON. */
  addLesson: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        title: z.string().min(1).max(200),
        moduleId: z.number().optional(),
        body: z.any().optional(),
        resources: z.array(resourceSchema).max(20).default([]),
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
      assertCourseEditable(course);

      // Keep the flat-or-fully-moduled invariant: a moduled course's new
      // lesson always lands in a module — the one asked for, else the last.
      const { docs: courseModules } = await payload.find({
        collection: "modules",
        where: { course: { equals: input.courseId } },
        sort: "-order",
        limit: 1000,
        depth: 0,
      });
      let targetModuleId: number | null = courseModules[0]?.id ?? null;
      if (input.moduleId !== undefined) {
        if (!courseModules.some((mod) => mod.id === input.moduleId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "MODULE_COURSE_MISMATCH",
          });
        }
        targetModuleId = input.moduleId;
      }

      // Append after the highest order, not at the count: moves between
      // modules can leave gaps, and a count would then collide.
      const { docs: last } = await payload.find({
        collection: "lessons",
        where:
          targetModuleId !== null
            ? { module: { equals: targetModuleId } }
            : { course: { equals: input.courseId } },
        sort: "-order",
        limit: 1,
        depth: 0,
      });
      const lessonOrder = (last[0]?.order ?? -1) + 1;

      assertLessonBodyEmbeds(input.body);
      await assertLessonMaterials(payload, input.courseId, input.body);
      const lesson = await payload.create({
        collection: "lessons",
        data: {
          course: input.courseId,
          title: input.title,
          order: lessonOrder,
          ...(targetModuleId !== null ? { module: targetModuleId } : {}),
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

  /**
   * Update a lesson on own course. expectedUpdatedAt makes a save from a stale
   * tab fail loudly (LESSON_CHANGED) instead of overwriting newer edits.
   */
  updateLesson: protectedProcedure
    .input(
      z.object({
        lessonId: z.number(),
        title: z.string().min(1).max(200).optional(),
        body: z.any().optional(),
        order: z.number().optional(),
        resources: z.array(resourceSchema).max(20).optional(),
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
        expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
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
      assertCourseEditable(course);

      if (
        input.expectedUpdatedAt !== undefined &&
        new Date(input.expectedUpdatedAt).getTime() !==
          new Date(lesson.updatedAt).getTime()
      ) {
        throw new TRPCError({ code: "CONFLICT", message: "LESSON_CHANGED" });
      }

      assertLessonBodyEmbeds(input.body);
      await assertLessonMaterials(payload, course.id, input.body);
      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
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

      const updated = await payload.update({
        collection: "lessons",
        id: input.lessonId,
        data,
      });

      return { ok: true as const, updatedAt: updated.updatedAt };
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
      assertCourseEditable(course);

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
      assertCourseEditable(course);

      const { totalDocs: moduleCount } = await payload.find({
        collection: "modules",
        where: { course: { equals: input.courseId } },
        limit: 0,
        depth: 0,
      });

      // Create + wrap must land together: a module without the lesson wrap
      // would leave the course mixed (moduled with module-null lessons), which
      // groupLessonsByModule hides from learners.
      const transactionID = await payload.db.beginTransaction();
      const req = transactionID ? { transactionID } : undefined;
      try {
        const moduleDoc = await payload.create({
          collection: "modules",
          data: {
            course: input.courseId,
            title: input.title,
            order: moduleCount,
            summary: input.summary ?? undefined,
          },
          req,
        });

        // First module on a flat course: wrap all existing lessons into it,
        // preserving their order.
        let wrapped: LessonVersion[] = [];
        if (moduleCount === 0) {
          const { docs } = await payload.update({
            collection: "lessons",
            where: { course: { equals: input.courseId } },
            data: { module: moduleDoc.id },
            req,
          });
          wrapped = lessonVersions(docs);
        }

        if (transactionID) await payload.db.commitTransaction(transactionID);
        return { id: moduleDoc.id, lessons: wrapped };
      } catch (error) {
        if (transactionID) await payload.db.rollbackTransaction(transactionID);
        throw error;
      }
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
      assertCourseEditable(course);

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      // null passes through: explicit null clears the summary field.
      if (input.summary !== undefined) data.summary = input.summary;

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
      assertCourseEditable(course);

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
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "MODULE_SET_MISMATCH",
        });
      }

      // All order updates land together — a partial reorder would leave
      // duplicate/skipped order values.
      const transactionID = await payload.db.beginTransaction();
      const req = transactionID ? { transactionID } : undefined;
      try {
        for (let i = 0; i < input.orderedIds.length; i++) {
          await payload.update({
            collection: "modules",
            id: input.orderedIds[i]!,
            data: { order: i },
            req,
          });
        }
        if (transactionID) await payload.db.commitTransaction(transactionID);
      } catch (error) {
        if (transactionID) await payload.db.rollbackTransaction(transactionID);
        throw error;
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
      assertCourseEditable(course);

      const moduleDoc = await payload.findByID({
        collection: "modules",
        id: input.moduleId,
        depth: 0,
      });
      if (moduleDoc.course !== lesson.course) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "MODULE_COURSE_MISMATCH",
        });
      }

      // Append after the highest order (orders may have gaps after moves).
      const { docs: last } = await payload.find({
        collection: "lessons",
        where: {
          and: [
            { course: { equals: lesson.course } },
            { module: { equals: input.moduleId } },
          ],
        },
        sort: "-order",
        limit: 1,
        depth: 0,
      });

      const moved = await payload.update({
        collection: "lessons",
        id: input.lessonId,
        data: { module: input.moduleId, order: (last[0]?.order ?? -1) + 1 },
      });
      return { ok: true, lessons: lessonVersions([moved]) };
    }),

  /**
   * Set the complete order of one container — a module, or the flat course
   * when moduleId is null. orderedIds may pull lessons in from another module
   * of the same course (drag across modules); every lesson already in the
   * container must be listed, so nothing is silently dropped. Keeps the
   * flat-or-fully-moduled invariant: a moduled course never gets a null module.
   */
  reorderLessons: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        moduleId: z.number().nullable(),
        orderedIds: z.array(z.number()).min(1).max(500),
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
      assertCourseEditable(course);

      const { docs: modules } = await payload.find({
        collection: "modules",
        where: { course: { equals: input.courseId } },
        limit: 1000,
        depth: 0,
      });
      const moduled = modules.length > 0;
      const moduleValid = moduled
        ? input.moduleId !== null &&
          modules.some((mod) => mod.id === input.moduleId)
        : input.moduleId === null;
      if (!moduleValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "MODULE_COURSE_MISMATCH",
        });
      }

      const { docs: lessons } = await payload.find({
        collection: "lessons",
        where: { course: { equals: input.courseId } },
        pagination: false,
        depth: 0,
      });
      const courseLessonIds = new Set(lessons.map((l) => l.id));
      const listed = new Set(input.orderedIds);
      const currentMembers = lessons.filter(
        (l) => relationId(l.module) === input.moduleId,
      );
      if (
        listed.size !== input.orderedIds.length ||
        !input.orderedIds.every((id) => courseLessonIds.has(id)) ||
        !currentMembers.every((l) => listed.has(l.id))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "LESSON_SET_MISMATCH",
        });
      }

      // All writes land together — a partial reorder would leave duplicate
      // order values or a lesson stranded between modules.
      const transactionID = await payload.db.beginTransaction();
      const req = transactionID ? { transactionID } : undefined;
      const rewritten: LessonVersion[] = [];
      try {
        for (let i = 0; i < input.orderedIds.length; i++) {
          const lesson = await payload.update({
            collection: "lessons",
            id: input.orderedIds[i]!,
            data: { order: i, module: input.moduleId },
            req,
          });
          rewritten.push(...lessonVersions([lesson]));
        }
        if (transactionID) await payload.db.commitTransaction(transactionID);
      } catch (error) {
        if (transactionID) await payload.db.rollbackTransaction(transactionID);
        throw error;
      }
      return { ok: true, lessons: rewritten };
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
      assertCourseEditable(course);

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
      assertCourseEditable(course);

      // Null-out and module deletion must land together — un-moduled lessons
      // alongside surviving modules would make groupLessonsByModule hide the
      // course's content.
      const transactionID = await payload.db.beginTransaction();
      const req = transactionID ? { transactionID } : undefined;
      let unwrapped: LessonVersion[];
      try {
        const { docs } = await payload.update({
          collection: "lessons",
          where: { course: { equals: input.courseId } },
          data: { module: null },
          req,
        });
        unwrapped = lessonVersions(docs);

        await payload.delete({
          collection: "modules",
          where: { course: { equals: input.courseId } },
          req,
        });

        if (transactionID) await payload.db.commitTransaction(transactionID);
      } catch (error) {
        if (transactionID) await payload.db.rollbackTransaction(transactionID);
        throw error;
      }
      return { ok: true, lessons: unwrapped };
    }),

  /** Enroll the caller in a published course; awards the author enrollment XP. */
  enroll: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const payload = await getPayloadClient();
      // Gate before the enrollment lookup, so a viewer who lost access can't
      // even learn that they are still enrolled.
      const course = await requireReadableCourse(
        ctx.db,
        payload,
        input.courseId,
        userId,
      );
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
      // A missing lesson answers like a hidden one: NOT_FOUND.
      const lesson = await payload.findByID({
        collection: "lessons",
        id: input.lessonId,
        depth: 0,
        disableErrors: true,
      });
      if (!lesson) throw new TRPCError({ code: "NOT_FOUND" });
      const courseId = lesson.course;
      await requireReadableCourse(ctx.db, payload, courseId, userId);

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

  /** Toggle a lesson's completion for the caller (enrolled-only; no XP). */
  markLessonComplete: protectedProcedure
    .input(z.object({ lessonId: z.number(), completed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const payload = await getPayloadClient();
      // A missing lesson answers like a hidden one: NOT_FOUND.
      const lesson = await payload.findByID({
        collection: "lessons",
        id: input.lessonId,
        depth: 0,
        disableErrors: true,
      });
      if (!lesson) throw new TRPCError({ code: "NOT_FOUND" });
      const courseId = lesson.course;
      await requireReadableCourse(ctx.db, payload, courseId, userId);

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
