import { and, eq, isNull } from "drizzle-orm";
import type { CommunityRole } from "@/lib/classroom";
import type { db } from "@/server/db";
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
