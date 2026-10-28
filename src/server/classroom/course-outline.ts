export type OutlineModule = {
  id: number;
  course: number;
  title: string;
  order?: number | null;
  summary?: string | null;
};

export type OutlineLesson = {
  id: number;
  course: number;
  module?: number | null;
  title: string;
  order?: number | null;
};

function lessonCard(lesson: OutlineLesson) {
  return {
    id: lesson.id,
    title: lesson.title,
    order: lesson.order ?? 0,
  };
}

/** Modules with their lessons, plus lessons that are not in a module. */
export function presentClassroomCourse<T extends { id: number }>(
  course: T,
  modules: readonly OutlineModule[],
  lessons: readonly OutlineLesson[],
) {
  const courseLessons = lessons.filter((lesson) => lesson.course === course.id);
  return {
    modules: modules
      .filter((mod) => mod.course === course.id)
      .map((mod) => ({
        id: mod.id,
        title: mod.title,
        order: mod.order ?? 0,
        summary: mod.summary ?? null,
        lessons: courseLessons
          .filter((lesson) => lesson.module === mod.id)
          .map(lessonCard),
      })),
    lessons: courseLessons
      .filter((lesson) => lesson.module == null)
      .map(lessonCard),
  };
}
