import type { CommunityRole } from "@/lib/classroom";

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

export function resolveCourseAccess(input: {
  course: CourseAccessCourse;
  viewerId: string | null;
  membership: CourseAccessMembership | null;
}): CourseAccess {
  const { course, viewerId, membership } = input;
  if (viewerId !== null && course.authorId === viewerId) return "manager";

  const role = membership?.active ? membership.role : null;
  if (role !== null && MANAGER_ROLES.has(role)) return "manager";

  if (course.status !== "published") return "none";
  if (role !== null) return "member";
  return course.isPublic === true ? "visitor" : "none";
}
