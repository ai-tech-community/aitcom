import { groupLessonsByModule } from "@/lib/classroom";

export type OutlineLesson = { id: number; title: string; module: number | null; order: number };
export type OutlineModule = { id: number; title: string; order: number; summary?: string | null };
export type OutlineGroup = {
  moduleId: number | null;
  title: string | null;
  summary: string | null;
  lessonIds: number[];
};
/** Exactly the reorderLessons input, minus courseId. */
export type LessonMove = { moduleId: number | null; orderedIds: number[] };
type MoveResult = { groups: OutlineGroup[]; move: LessonMove };

/** The builder's outline: the same grouping learners see (course-view uses groupLessonsByModule). */
export function buildOutline(lessons: OutlineLesson[], modules: OutlineModule[]): OutlineGroup[] {
  const summaries = new Map(modules.map((mod) => [mod.id, mod.summary ?? null]));
  return groupLessonsByModule(lessons, modules).map((g) => ({
    moduleId: g.module?.id ?? null,
    title: g.module?.title ?? null,
    summary: g.module ? (summaries.get(g.module.id) ?? null) : null,
    lessonIds: g.lessons.map((l) => l.id),
  }));
}

export function findLesson(groups: OutlineGroup[], lessonId: number) {
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const index = groups[groupIndex]!.lessonIds.indexOf(lessonId);
    if (index !== -1) return { groupIndex, index };
  }
  return null;
}

export function applyLessonMove(
  groups: OutlineGroup[],
  lessonId: number,
  target: { moduleId: number | null; index: number },
): MoveResult | null {
  const from = findLesson(groups, lessonId);
  const toGroupIndex = groups.findIndex((g) => g.moduleId === target.moduleId);
  if (!from || toGroupIndex === -1) return null;

  const next = groups.map((g) => ({ ...g, lessonIds: [...g.lessonIds] }));
  next[from.groupIndex]!.lessonIds.splice(from.index, 1);
  const dest = next[toGroupIndex]!.lessonIds;
  const index = Math.max(0, Math.min(target.index, dest.length));
  dest.splice(index, 0, lessonId);

  if (from.groupIndex === toGroupIndex && from.index === index) return null;
  return { groups: next, move: { moduleId: target.moduleId, orderedIds: [...dest] } };
}

/** One step up or down in reading order, crossing into the neighbouring module at its edge. */
export function moveByStep(groups: OutlineGroup[], lessonId: number, delta: -1 | 1): MoveResult | null {
  const from = findLesson(groups, lessonId);
  if (!from) return null;
  const group = groups[from.groupIndex]!;
  const within = from.index + delta;
  if (within >= 0 && within < group.lessonIds.length) {
    return applyLessonMove(groups, lessonId, { moduleId: group.moduleId, index: within });
  }
  const neighbour = groups[from.groupIndex + delta];
  if (!neighbour) return null;
  return applyLessonMove(groups, lessonId, {
    moduleId: neighbour.moduleId,
    index: delta === 1 ? 0 : neighbour.lessonIds.length,
  });
}

export function readingOrder(groups: OutlineGroup[]): number[] {
  return groups.flatMap((g) => g.lessonIds);
}

/**
 * The default name for a new module: "<label> <n>", where n starts after the
 * current module count and skips any number an existing "<label> <n>" title
 * already uses (a deleted module can leave "Module 3" behind with only two
 * modules left).
 */
export function nextModuleTitle(label: string, existingTitles: readonly string[]): string {
  const taken = new Set(existingTitles.map((title) => title.trim()));
  let n = existingTitles.length + 1;
  while (taken.has(`${label} ${n}`)) n++;
  return `${label} ${n}`;
}
