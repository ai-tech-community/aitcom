/**
 * What browse-classrooms reports as `status`.
 *
 * The course page's public badge reads `isPublic`. The editorial column
 * `status` stays `draft` after Make public, so agents that read `status`
 * treated a public course as a draft. Archived still wins: a removed course
 * is not public.
 */
export function classroomBrowseStatus(course: {
  status?: string | null;
  isPublic?: boolean | null;
}): "draft" | "published" | "archived" {
  if (course.status === "archived") return "archived";
  if (course.status === "published" || course.isPublic === true) {
    return "published";
  }
  return "draft";
}
