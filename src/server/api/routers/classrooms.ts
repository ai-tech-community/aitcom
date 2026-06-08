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
import { and, eq, isNull } from "drizzle-orm";
import type { db } from "@/server/db";
import {
  communities,
  communityMemberships,
  courseEnrollments,
  lessonCompletions,
} from "@/server/db/schema";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import { canCreateCourse, type CommunityRole } from "@/lib/classroom";

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

      const conditions: Where[] = [
        { communityId: { equals: communityId } },
        { status: { equals: "published" } },
      ];
      // Non-members only see public courses.
      if (role === null) conditions.push({ isPublic: { equals: true } });

      const { docs } = await payload.find({
        collection: "courses",
        where: { and: conditions },
        sort: "-enrollmentCount",
        limit: 50,
        depth: 0,
      });

      return docs;
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

      const { docs: lessons } = await payload.find({
        collection: "lessons",
        where: { course: { equals: course.id } },
        sort: "order",
        limit: 200,
        depth: 0,
      });

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

      return { course, lessons, enrolled, completedLessonIds };
    }),

  /** Create a course (active member; honors classroomCreatePolicy). */
  create: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        title: z.string().min(3).max(200),
        summary: z.string().max(500).optional(),
        status: z.enum(["draft", "published"]).default("published"),
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

      await payload.update({
        collection: "courses",
        id: input.courseId,
        data,
      });

      return { ok: true };
    }),

  /** Add a lesson to own course. body is plain text → lexical. */
  addLesson: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        title: z.string().min(1).max(200),
        youtubeUrl: z.string().url().max(500).optional(),
        body: z.string().max(20000).optional(),
        resources: z
          .array(
            z.object({
              label: z.string().min(1).max(120),
              url: z.string().url().max(500),
            }),
          )
          .max(20)
          .default([]),
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

      const { totalDocs } = await payload.find({
        collection: "lessons",
        where: { course: { equals: input.courseId } },
        limit: 0,
        depth: 0,
      });

      const lesson = await payload.create({
        collection: "lessons",
        data: {
          course: input.courseId,
          title: input.title,
          order: totalDocs,
          youtubeUrl: input.youtubeUrl ?? undefined,
          body: input.body ? plainTextToLexical(input.body) : undefined,
          resources: input.resources,
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
        body: z.string().max(20000).optional(),
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
      if (input.body !== undefined) data.body = plainTextToLexical(input.body);
      if (input.order !== undefined) data.order = input.order;
      if (input.resources !== undefined) data.resources = input.resources;

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
});
