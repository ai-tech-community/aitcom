import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import type { Where } from "payload";
import { z } from "zod";

import { canCreateCourse, type CommunityRole } from "@/lib/classroom";
import { COURSE_TITLE_MIN } from "@/lib/classroom/course-title";
import {
  CLASSROOM_COURSE_DRAFT_TYPE,
  CLASSROOM_COURSE_UPDATE_DRAFT_TYPE,
  CLASSROOM_LESSON_DRAFT_TYPE,
  CLASSROOM_MODULE_DRAFT_TYPE,
  classroomCourseFromDraft,
  classroomCourseSlug,
  classroomCourseUpdateFromDraft,
  classroomLessonFromDraft,
  classroomModuleFromDraft,
  classroomContentStatus,
  classroomWriteIsMemberVisible,
  classroomWriteNeedsApproval,
  type ClassroomCourseDraft,
  type ClassroomCourseUpdateDraft,
  type ClassroomLessonDraft,
  type ClassroomModuleDraft,
} from "@/server/classroom/agent-course-draft";
import { agentDraftResponse } from "@/server/agent/draft-result";
import { logActivity } from "@/server/agent/activity";
import { agentProcedure, requireOwner, requireScope } from "@/server/api/trpc";
import {
  assertCourseEditable,
  isCourseManagerRole,
  resolveCourseAccess,
} from "@/server/classroom/course-access";
import {
  createCourseLesson,
  createCourseModule,
  updateCourseFields,
  updateCourseLesson,
  updateCourseModule,
} from "@/server/classroom/course-writes";
import { lessonMarkdownToLexical } from "@/lib/classroom/lesson-markdown";
import {
  agentDrafts,
  communities,
  communityMemberships,
} from "@/server/db/schema";
import { uniqueClassroomCourseSlug } from "@/server/classroom/course-slug";
import { presentClassroomCourse } from "@/server/classroom/course-outline";
import { memberDisplayName } from "@/server/members/display-name";
import { getPayloadClient } from "@/server/payload";

export {
  CLASSROOM_COURSE_DRAFT_TYPE,
  CLASSROOM_COURSE_UPDATE_DRAFT_TYPE,
  CLASSROOM_LESSON_DRAFT_TYPE,
  CLASSROOM_MODULE_DRAFT_TYPE,
  classroomCourseFromDraft,
  classroomCourseSlug,
  classroomCourseUpdateFromDraft,
  classroomLessonFromDraft,
  classroomModuleFromDraft,
  classroomWriteIsMemberVisible,
};
export type { ClassroomCourseDraft };

/** Leave a pending draft pending when its address is already a course. */
export async function assertClassroomDraftPublishable(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  draft: { content: string | null; metadata: unknown },
): Promise<ClassroomCourseDraft> {
  const parsed = classroomCourseFromDraft(draft);
  const { docs } = await payload.find({
    collection: "courses",
    where: { slug: { equals: parsed.slug } },
    limit: 1,
    depth: 0,
  });
  if (docs.length > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "A classroom already uses this address. Reject the draft and create it again.",
    });
  }
  return parsed;
}

export async function publishClassroomCourseDraft(
  db: Parameters<typeof logActivity>[0],
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  userId: string,
  authorName: string,
  draft: ClassroomCourseDraft,
) {
  const course = await payload.create({
    collection: "courses",
    data: {
      title: draft.title,
      slug: draft.slug,
      summary: draft.summary ?? undefined,
      coverImageUrl: draft.coverImageUrl ?? undefined,
      authorId: userId,
      authorName,
      status: "published",
      communityId: draft.communityId,
      isPublic: false,
      enrollmentCount: 0,
    },
  });
  await logActivity(db, {
    actorId: userId,
    actorType: "member",
    action: "course.published",
    targetType: "courses",
    targetId: String(course.id),
    communityId: draft.communityId,
    metadata: { title: draft.title },
  });
  return { id: course.id, slug: course.slug };
}

export async function publishClassroomCourseUpdate(
  db: Parameters<typeof logActivity>[0],
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  userId: string,
  draft: ClassroomCourseUpdateDraft,
) {
  await updateCourseFields(payload, draft.courseId, draft);
  if (draft.status !== "published") return;
  const course = await payload.findByID({
    collection: "courses",
    id: draft.courseId,
    depth: 0,
  });
  await logActivity(db, {
    actorId: userId,
    actorType: "member",
    action: "course.published",
    targetType: "courses",
    targetId: String(course.id),
    communityId: course.communityId,
    metadata: { title: course.title },
  });
}

export async function publishClassroomModule(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  draft: ClassroomModuleDraft,
) {
  if (draft.action === "create") {
    return createCourseModule(payload, draft.courseId, {
      title: draft.title,
      summary: draft.summary,
    });
  }
  await updateCourseModule(payload, draft.moduleId!, {
    title: draft.title,
    ...(draft.summary !== undefined ? { summary: draft.summary } : {}),
  });
  return { id: draft.moduleId! };
}

export async function publishClassroomLesson(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  draft: ClassroomLessonDraft,
) {
  const body =
    draft.body === undefined
      ? undefined
      : lessonMarkdownToLexical(draft.body ?? "");
  if (draft.action === "create") {
    return createCourseLesson(payload, {
      courseId: draft.courseId,
      moduleId: draft.moduleId,
      title: draft.title,
      ...(body !== undefined ? { body } : {}),
    });
  }
  await updateCourseLesson(payload, draft.lessonId!, {
    title: draft.title,
    ...(body !== undefined ? { body } : {}),
  });
  return { id: draft.lessonId! };
}

async function communityForOwner(
  db: Parameters<typeof logActivity>[0],
  slug: string,
) {
  const community = await db.query.communities.findFirst({
    where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
    columns: {
      id: true,
      slug: true,
      name: true,
      classroomCreatePolicy: true,
    },
  });
  if (!community) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
  }
  return community;
}

async function ownerRole(
  db: Parameters<typeof logActivity>[0],
  communityId: string,
  ownerId: string | null,
): Promise<CommunityRole | null> {
  if (!ownerId) return null;
  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, communityId),
      eq(communityMemberships.userId, ownerId),
      eq(communityMemberships.status, "active"),
    ),
    columns: { role: true },
  });
  return (membership?.role as CommunityRole | undefined) ?? null;
}

async function ownedCourse(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  courseId: number,
  ownerId: string,
) {
  const course = await payload.findByID({
    collection: "courses",
    id: courseId,
    depth: 0,
    disableErrors: true,
  });
  if (!course) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
  }
  if (course.authorId !== ownerId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  assertCourseEditable(course);
  return course;
}

async function assertCourseCommunity(
  db: Parameters<typeof logActivity>[0],
  slug: string,
  communityId: string,
) {
  const community = await communityForOwner(db, slug);
  if (community.id !== communityId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
  }
  return community;
}

async function holdClassroomDraft(
  ctx: {
    db: Parameters<typeof logActivity>[0];
    agent: { agentId: string };
  },
  input: {
    ownerId: string;
    type: string;
    targetId: string;
    content: string;
    slug: string;
    body: string;
    metadata: Record<string, unknown>;
  },
) {
  const [draft] = await ctx.db
    .insert(agentDrafts)
    .values({
      agentId: ctx.agent.agentId,
      ownerId: input.ownerId,
      type: input.type,
      targetType: "courses",
      targetId: input.targetId,
      content: input.content,
      status: "pending",
      metadata: input.metadata,
    })
    .returning({ id: agentDrafts.id });
  return {
    ...agentDraftResponse({
      draftId: draft!.id,
      slug: input.slug,
      body: input.body,
    }),
    status: "draft" as const,
  };
}

export const agentClassroomRouter = {
  browseClassrooms: agentProcedure
    .input(
      z.object({
        communitySlug: z.string().min(1),
        courseSlug: z.string().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const community = await communityForOwner(ctx.db, input.communitySlug);
      const role = await ownerRole(ctx.db, community.id, ctx.agent.ownerId);
      const payload = await getPayloadClient();
      const userId = ctx.agent.ownerId;
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
      const where: Where[] = [
        { communityId: { equals: community.id } },
        { or: candidates },
      ];
      if (input.courseSlug) where.push({ slug: { equals: input.courseSlug } });
      const { docs: found } = await payload.find({
        collection: "courses",
        where: { and: where },
        sort: "-enrollmentCount",
        limit: 50,
        depth: 0,
      });
      const membership = role === null ? null : { role, active: true as const };
      const courses = found.filter(
        (course) =>
          resolveCourseAccess({
            course,
            viewerId: userId,
            membership,
          }) !== "none",
      );
      const courseIds = courses.map((course) => course.id);
      const { docs: modules } =
        courseIds.length === 0
          ? { docs: [] }
          : await payload.find({
              collection: "modules",
              where: { course: { in: courseIds } },
              sort: "order",
              limit: 1000,
              depth: 0,
              pagination: false,
            });
      const { docs: lessons } =
        courseIds.length === 0
          ? { docs: [] }
          : await payload.find({
              collection: "lessons",
              where: { course: { in: courseIds } },
              sort: "order",
              limit: 1000,
              depth: 0,
              pagination: false,
            });
      return {
        classroomCreatePolicy: community.classroomCreatePolicy ?? "all_members",
        courses: courses.map((course) => {
          const outline = presentClassroomCourse(course, modules, lessons);
          return {
            id: course.id,
            title: course.title,
            slug: course.slug,
            summary: course.summary ?? null,
            status: course.status,
            authorId: course.authorId,
            authorName: course.authorName ?? null,
            isPublic: course.isPublic === true,
            modules: outline.modules,
            lessons: outline.lessons,
          };
        }),
      };
    }),

  createClassroom: agentProcedure
    .input(
      z.object({
        communitySlug: z.string().min(1),
        title: z.string().min(COURSE_TITLE_MIN).max(200),
        summary: z.string().max(500).optional(),
        status: z.enum(["draft", "published"]).default("draft"),
        coverImageUrl: z.string().url().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await communityForOwner(ctx.db, input.communitySlug);
      const role = await ownerRole(ctx.db, community.id, ownerId);
      if (
        !canCreateCourse(community.classroomCreatePolicy ?? "all_members", role)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "CANNOT_CREATE_COURSE",
        });
      }
      const payloadForSlug = await getPayloadClient();
      const slug = await uniqueClassroomCourseSlug(payloadForSlug, input.title);
      const body = input.summary ?? "";
      if (classroomWriteIsMemberVisible(input.status)) {
        const [draft] = await ctx.db
          .insert(agentDrafts)
          .values({
            agentId: ctx.agent.agentId,
            ownerId,
            type: CLASSROOM_COURSE_DRAFT_TYPE,
            targetType: "community",
            targetId: community.id,
            content: input.title,
            status: "pending",
            metadata: {
              communityId: community.id,
              communitySlug: community.slug,
              slug,
              summary: input.summary ?? null,
              coverImageUrl: input.coverImageUrl ?? null,
              destinationLabel: `${community.name} classroom`,
              destinationPath: `/communities/${community.slug}/classroom`,
            },
          })
          .returning({ id: agentDrafts.id });
        return agentDraftResponse({
          draftId: draft!.id,
          slug,
          body,
        });
      }
      const authorName = (await memberDisplayName(ctx.db, ownerId)) ?? "member";
      const payload = await getPayloadClient();
      const course = await payload.create({
        collection: "courses",
        data: {
          title: input.title,
          slug,
          summary: input.summary ?? undefined,
          coverImageUrl: input.coverImageUrl ?? undefined,
          authorId: ownerId,
          authorName,
          status: "draft",
          communityId: community.id,
          isPublic: false,
          enrollmentCount: 0,
        },
      });
      return {
        mode: "created" as const,
        courseId: course.id,
        slug: course.slug,
        status: "draft" as const,
        body,
      };
    }),

  updateClassroom: agentProcedure
    .input(
      z.object({
        communitySlug: z.string().min(1),
        courseId: z.number().int().positive(),
        title: z.string().min(COURSE_TITLE_MIN).max(200).optional(),
        slug: z.string().min(1).max(80).optional(),
        summary: z.string().max(500).nullable().optional(),
        status: z.enum(["draft", "published"]).optional(),
        coverImageUrl: z.string().url().max(1000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      if (
        input.title === undefined &&
        input.slug === undefined &&
        input.summary === undefined &&
        input.status === undefined &&
        input.coverImageUrl === undefined
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No classroom fields to update",
        });
      }
      const payload = await getPayloadClient();
      const course = await ownedCourse(payload, input.courseId, ownerId);
      await assertCourseCommunity(
        ctx.db,
        input.communitySlug,
        course.communityId,
      );
      const slugSource = input.slug ?? input.title;
      const slug =
        slugSource === undefined
          ? undefined
          : await uniqueClassroomCourseSlug(payload, slugSource, course.slug);
      const patch = {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.coverImageUrl !== undefined
          ? { coverImageUrl: input.coverImageUrl }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      };
      const held = classroomWriteNeedsApproval(course.status, input.status);
      if (!held) {
        await updateCourseFields(payload, course.id, patch);
        return {
          mode: "updated" as const,
          courseId: course.id,
          slug: slug ?? course.slug,
          status: classroomContentStatus(course.status, false),
        };
      }
      const [draft] = await ctx.db
        .insert(agentDrafts)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: CLASSROOM_COURSE_UPDATE_DRAFT_TYPE,
          targetType: "courses",
          targetId: String(course.id),
          content: input.title ?? course.title,
          status: "pending",
          metadata: {
            courseId: course.id,
            ...patch,
            destinationLabel: course.title,
            destinationPath: `/communities/${input.communitySlug}/classroom/${course.slug}`,
          },
        })
        .returning({ id: agentDrafts.id });
      return {
        ...agentDraftResponse({
          draftId: draft!.id,
          slug: slug ?? course.slug,
          body: input.summary ?? course.summary ?? "",
        }),
        status: classroomContentStatus(course.status, true),
      };
    }),

  createModule: agentProcedure
    .input(
      z.object({
        communitySlug: z.string().min(1),
        courseId: z.number().int().positive(),
        title: z.string().min(1).max(200),
        summary: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const payload = await getPayloadClient();
      const course = await ownedCourse(payload, input.courseId, ownerId);
      await assertCourseCommunity(
        ctx.db,
        input.communitySlug,
        course.communityId,
      );
      if (classroomWriteNeedsApproval(course.status)) {
        return holdClassroomDraft(ctx, {
          ownerId,
          type: CLASSROOM_MODULE_DRAFT_TYPE,
          targetId: String(course.id),
          content: input.title,
          slug: course.slug,
          body: input.summary ?? "",
          metadata: {
            action: "create",
            courseId: course.id,
            title: input.title,
            ...(input.summary !== undefined ? { summary: input.summary } : {}),
            destinationLabel: course.title,
            destinationPath: `/communities/${input.communitySlug}/classroom/${course.slug}`,
          },
        });
      }
      const created = await createCourseModule(payload, course.id, input);
      return {
        mode: "created" as const,
        moduleId: created.id,
        courseId: course.id,
        status: classroomContentStatus(course.status, false),
      };
    }),

  updateModule: agentProcedure
    .input(
      z.object({
        communitySlug: z.string().min(1),
        moduleId: z.number().int().positive(),
        title: z.string().min(1).max(200).optional(),
        summary: z.string().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      if (input.title === undefined && input.summary === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No module fields to update",
        });
      }
      const payload = await getPayloadClient();
      const moduleDoc = await payload.findByID({
        collection: "modules",
        id: input.moduleId,
        depth: 0,
      });
      const course = await ownedCourse(payload, moduleDoc.course, ownerId);
      await assertCourseCommunity(
        ctx.db,
        input.communitySlug,
        course.communityId,
      );
      const title = input.title ?? moduleDoc.title;
      if (classroomWriteNeedsApproval(course.status)) {
        return holdClassroomDraft(ctx, {
          ownerId,
          type: CLASSROOM_MODULE_DRAFT_TYPE,
          targetId: String(moduleDoc.id),
          content: title,
          slug: course.slug,
          body: input.summary ?? moduleDoc.summary ?? "",
          metadata: {
            action: "update",
            courseId: course.id,
            moduleId: moduleDoc.id,
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.summary !== undefined ? { summary: input.summary } : {}),
            destinationLabel: course.title,
            destinationPath: `/communities/${input.communitySlug}/classroom/${course.slug}`,
          },
        });
      }
      await updateCourseModule(payload, moduleDoc.id, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
      });
      return {
        mode: "updated" as const,
        moduleId: moduleDoc.id,
        courseId: course.id,
        status: classroomContentStatus(course.status, false),
      };
    }),

  createLesson: agentProcedure
    .input(
      z.object({
        communitySlug: z.string().min(1),
        courseId: z.number().int().positive(),
        moduleId: z.number().int().positive().optional(),
        title: z.string().min(1).max(200),
        body: z.string().max(50_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const payload = await getPayloadClient();
      const course = await ownedCourse(payload, input.courseId, ownerId);
      await assertCourseCommunity(
        ctx.db,
        input.communitySlug,
        course.communityId,
      );
      if (input.moduleId !== undefined) {
        const moduleDoc = await payload.findByID({
          collection: "modules",
          id: input.moduleId,
          depth: 0,
        });
        if (moduleDoc.course !== course.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That module is not in this classroom",
          });
        }
      }
      if (classroomWriteNeedsApproval(course.status)) {
        return holdClassroomDraft(ctx, {
          ownerId,
          type: CLASSROOM_LESSON_DRAFT_TYPE,
          targetId: String(course.id),
          content: input.title,
          slug: course.slug,
          body: input.body ?? "",
          metadata: {
            action: "create",
            courseId: course.id,
            title: input.title,
            ...(input.moduleId !== undefined
              ? { moduleId: input.moduleId }
              : {}),
            ...(input.body !== undefined ? { body: input.body } : {}),
            destinationLabel: course.title,
            destinationPath: `/communities/${input.communitySlug}/classroom/${course.slug}`,
          },
        });
      }
      const created = await createCourseLesson(payload, {
        courseId: course.id,
        moduleId: input.moduleId,
        title: input.title,
        ...(input.body !== undefined
          ? { body: lessonMarkdownToLexical(input.body) }
          : {}),
      });
      return {
        mode: "created" as const,
        lessonId: created.id,
        courseId: course.id,
        status: classroomContentStatus(course.status, false),
      };
    }),

  updateLesson: agentProcedure
    .input(
      z.object({
        communitySlug: z.string().min(1),
        lessonId: z.number().int().positive(),
        title: z.string().min(1).max(200).optional(),
        body: z.string().max(50_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      if (input.title === undefined && input.body === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No lesson fields to update",
        });
      }
      const payload = await getPayloadClient();
      const lesson = await payload.findByID({
        collection: "lessons",
        id: input.lessonId,
        depth: 0,
      });
      const course = await ownedCourse(payload, lesson.course, ownerId);
      await assertCourseCommunity(
        ctx.db,
        input.communitySlug,
        course.communityId,
      );
      const title = input.title ?? lesson.title;
      if (classroomWriteNeedsApproval(course.status)) {
        return holdClassroomDraft(ctx, {
          ownerId,
          type: CLASSROOM_LESSON_DRAFT_TYPE,
          targetId: String(lesson.id),
          content: title,
          slug: course.slug,
          body: input.body ?? "",
          metadata: {
            action: "update",
            courseId: course.id,
            lessonId: lesson.id,
            title,
            ...(input.body !== undefined ? { body: input.body } : {}),
            destinationLabel: course.title,
            destinationPath: `/communities/${input.communitySlug}/classroom/${course.slug}`,
          },
        });
      }
      await updateCourseLesson(payload, lesson.id, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined
          ? { body: lessonMarkdownToLexical(input.body) }
          : {}),
      });
      return {
        mode: "updated" as const,
        lessonId: lesson.id,
        courseId: course.id,
        status: classroomContentStatus(course.status, false),
      };
    }),
};
