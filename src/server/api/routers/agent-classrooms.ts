import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import type { Where } from "payload";
import { z } from "zod";

import { canCreateCourse, type CommunityRole } from "@/lib/classroom";
import { COURSE_TITLE_MIN } from "@/lib/classroom/course-title";
import {
  CLASSROOM_COURSE_DRAFT_TYPE,
  classroomCourseFromDraft,
  classroomCourseSlug,
  classroomWriteIsMemberVisible,
  type ClassroomCourseDraft,
} from "@/server/classroom/agent-course-draft";
import { agentDraftResponse } from "@/server/agent/draft-result";
import { logActivity } from "@/server/agent/activity";
import { agentProcedure, requireOwner, requireScope } from "@/server/api/trpc";
import {
  isCourseManagerRole,
  resolveCourseAccess,
} from "@/server/classroom/course-access";
import {
  agentDrafts,
  communities,
  communityMemberships,
} from "@/server/db/schema";
import { memberDisplayName } from "@/server/members/display-name";
import { getPayloadClient } from "@/server/payload";

export {
  CLASSROOM_COURSE_DRAFT_TYPE,
  classroomCourseFromDraft,
  classroomCourseSlug,
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
      return {
        classroomCreatePolicy: community.classroomCreatePolicy ?? "all_members",
        courses: courses.map((course) => ({
          id: course.id,
          title: course.title,
          slug: course.slug,
          summary: course.summary ?? null,
          status: course.status,
          authorId: course.authorId,
          authorName: course.authorName ?? null,
          isPublic: course.isPublic === true,
          modules: modules
            .filter((mod) => mod.course === course.id)
            .map((mod) => ({
              id: mod.id,
              title: mod.title,
              order: mod.order ?? 0,
              summary: mod.summary ?? null,
            })),
        })),
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
      const slug = classroomCourseSlug(input.title);
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
};
