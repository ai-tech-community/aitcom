/**
 * Where a request for a course's builder should land. Only the author edits,
 * and only under the community the course belongs to: a link that names the
 * wrong community is sent to the right one, so the builder never shows one
 * community's frame around another community's course.
 *
 * Paths are locale-free; the page adds the locale.
 */
export type CourseEditRoute =
  | { kind: "edit" }
  | { kind: "redirect"; path: string };

export function courseEditRoute({
  course,
  userId,
  communitySlug,
  courseSlug,
}: {
  /** null when no course has this slug. `communitySlug` null: its community is gone. */
  course: { authorId: string; communitySlug: string | null } | null;
  userId: string;
  /** The community named in the requested URL. */
  communitySlug: string;
  courseSlug: string;
}): CourseEditRoute {
  const home = course?.communitySlug ?? communitySlug;
  const coursePage = `/communities/${home}/classroom/${courseSlug}`;
  // Not the author (or no such course): the course page, never a builder
  // that would fail on the first save. The server mutations stay the backstop.
  if (course?.authorId !== userId) {
    return { kind: "redirect", path: coursePage };
  }
  if (home !== communitySlug) {
    return { kind: "redirect", path: `${coursePage}/edit` };
  }
  return { kind: "edit" };
}
