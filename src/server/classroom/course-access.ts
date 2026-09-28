import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import type { CommunityRole } from "@/lib/classroom";
import type { Course } from "@/payload-types";
import type { db } from "@/server/db";
import type { getPayloadClient } from "@/server/payload";
import { communities, communityMemberships } from "@/server/db/schema";

/**
 * Who may read a classroom course. The single source of the course read
 * rules (spec 2026-09-27-classroom-lesson-materials §1, issue #351):
 *
 * - none    — may not know the course exists (callers answer NOT_FOUND)
 * - visitor — non-member on a public, published course
 * - member  — active community member on a published course
 * - manager — the author, or an active owner/admin/moderator
 *
 * Manager is about *seeing* (drafts, archived). It does not grant editing
 * and does not widen the exam answer key, which stays author-only.
 */
export type CourseAccess = "none" | "visitor" | "member" | "manager";

export type CourseAccessMembership = { role: CommunityRole; active: boolean };

export type CourseAccessCourse = {
  status: string;
  isPublic?: boolean | null;
  authorId: string;
};

const MANAGER_ROLES: ReadonlySet<CommunityRole> = new Set([
  "owner",
  "admin",
  "moderator",
]);

/** Whether an active community role manages (sees drafts/archived of) every course. */
export function isCourseManagerRole(role: CommunityRole | null): boolean {
  return role !== null && MANAGER_ROLES.has(role);
}

export function resolveCourseAccess(input: {
  course: CourseAccessCourse;
  viewerId: string | null;
  membership: CourseAccessMembership | null;
}): CourseAccess {
  const { course, viewerId, membership } = input;
  if (viewerId !== null && course.authorId === viewerId) return "manager";

  const role = membership?.active ? membership.role : null;
  if (isCourseManagerRole(role)) return "manager";

  if (course.status !== "published") return "none";
  if (role !== null) return "member";
  return course.isPublic === true ? "visitor" : "none";
}

export type LoadableCourse = CourseAccessCourse & { communityId: string };

/**
 * The caller's access to a course, read from the database. A course whose
 * community is missing or soft-deleted is `none` for everyone, including
 * its author.
 */
export async function loadCourseAccess(
  database: typeof db,
  course: LoadableCourse,
  viewerId: string | null,
): Promise<CourseAccess> {
  const community = await database.query.communities.findFirst({
    where: and(
      eq(communities.id, course.communityId),
      isNull(communities.deletedAt),
    ),
    columns: { id: true },
  });
  if (!community) return "none";

  let membership: CourseAccessMembership | null = null;
  if (viewerId !== null) {
    const row = await database.query.communityMemberships.findFirst({
      where: and(
        eq(communityMemberships.communityId, course.communityId),
        eq(communityMemberships.userId, viewerId),
      ),
      columns: { role: true, status: true },
    });
    if (row) membership = { role: row.role, active: row.status === "active" };
  }

  return resolveCourseAccess({ course, viewerId, membership });
}

/**
 * Load a course and require that the viewer may read it. A course the
 * viewer can't see is NOT_FOUND, the same answer as a course that doesn't
 * exist. The shared gate for every procedure that reads a course by id.
 */
export async function requireReadableCourse(
  database: typeof db,
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  courseId: number,
  viewerId: string,
): Promise<Course> {
  const course = await payload.findByID({
    collection: "courses",
    id: courseId,
    depth: 0,
    disableErrors: true,
  });
  if (!course) throw new TRPCError({ code: "NOT_FOUND" });
  const access = await loadCourseAccess(database, course, viewerId);
  if (access === "none") throw new TRPCError({ code: "NOT_FOUND" });
  return course;
}

/**
 * Load a course and require that the caller may edit it — today, only its
 * author (the same rule as every lesson/module mutation in classrooms.ts).
 * The shared gate for classroom material management.
 */
export async function requireEditableCourse(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  courseId: number,
  userId: string,
): Promise<Course> {
  const course = await payload.findByID({
    collection: "courses",
    id: courseId,
    depth: 0,
    disableErrors: true,
  });
  if (!course) throw new TRPCError({ code: "NOT_FOUND" });
  if (course.authorId !== userId) throw new TRPCError({ code: "FORBIDDEN" });
  return course;
}
