export type ClassroomCreatePolicy = "all_members" | "admins_only";
export type CommunityRole = "owner" | "admin" | "moderator" | "member";

/** Completed lessons / total, rounded, clamped 0..100. */
export function courseProgressPercent(
  completed: number,
  total: number,
): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

/** May this role create a course under the community's policy? null = not a member. */
export function canCreateCourse(
  policy: ClassroomCreatePolicy,
  role: CommunityRole | null,
): boolean {
  if (role === null) return false;
  if (policy === "admins_only") return role === "owner" || role === "admin";
  return true; // all_members: any active member
}

export type ExamQuestion = {
  id: string;
  prompt: string;
  type: "single" | "boolean";
  options: string[];
  correctIndex: number;
};
export type ExamDefinition = ExamQuestion[];
export type PublicExamQuestion = Omit<ExamQuestion, "correctIndex">;
export type ExamAnswer = { questionId: string; selectedIndex: number };

/** Grade objective answers against the key. Missing/out-of-range answers are wrong. */
export function gradeExam(
  questions: ExamQuestion[],
  answers: ExamAnswer[],
): { score: number; correctCount: number; wrongQuestionIds: string[] } {
  if (questions.length === 0) {
    return { score: 0, correctCount: 0, wrongQuestionIds: [] };
  }
  const picked = new Map(answers.map((a) => [a.questionId, a.selectedIndex]));
  const wrongQuestionIds: string[] = [];
  let correctCount = 0;
  for (const q of questions) {
    if (picked.get(q.id) === q.correctIndex) correctCount++;
    else wrongQuestionIds.push(q.id);
  }
  return {
    score: Math.round((correctCount / questions.length) * 100),
    correctCount,
    wrongQuestionIds,
  };
}

/** Did a score clear the pass threshold (inclusive)? */
export function examPassed(score: number, threshold: number): boolean {
  return score >= threshold;
}

/** Drop the answer key so questions are safe to send to the browser. */
export function stripAnswerKey(
  questions: ExamQuestion[],
): PublicExamQuestion[] {
  return questions.map(({ correctIndex: _correctIndex, ...rest }) => rest);
}

/** Course-pass is completion-derived: every lesson complete, and at least one lesson. */
export function coursePassed(completed: number, total: number): boolean {
  return total > 0 && completed >= total;
}

/** Convert a YouTube watch/youtu.be URL to an embed URL, or null if not YouTube/malformed. */
export function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.endsWith("youtube.com")) {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** A module's identity + ordering for grouping/reading-order purposes. */
export type ModuleRef = {
  id: number;
  title: string;
  order: number;
  summary?: string | null;
};

/** Minimal lesson shape these helpers need: which module (or none) and intra-order. */
type OrderableLesson = { module: number | null; order: number };

/**
 * Reading order = the tuple (module.order, lesson.order). A flat course (all
 * lessons module=null) sorts by lesson.order alone. Display/ordering only —
 * never affects completion counts.
 */
export function orderLessonsForReading<T extends OrderableLesson>(
  lessons: T[],
  modules: ModuleRef[],
): T[] {
  // Assumes lessons reference only modules present in `modules` (guaranteed by
  // the router, which builds both from the same course). An orphan id falls
  // back to order 0 (sorts among the first module) rather than throwing.
  const moduleOrder = new Map(modules.map((m) => [m.id, m.order]));
  return [...lessons].sort((a, b) => {
    const am = a.module === null ? -1 : (moduleOrder.get(a.module) ?? 0);
    const bm = b.module === null ? -1 : (moduleOrder.get(b.module) ?? 0);
    if (am !== bm) return am - bm;
    return a.order - b.order;
  });
}

/**
 * Group lessons for display. A flat course returns a single group with
 * `module: null`. A moduled course returns one group per module, in module
 * order, each holding its lessons in lesson order (empty modules included).
 */
export function groupLessonsByModule<T extends OrderableLesson>(
  lessons: T[],
  modules: ModuleRef[],
): Array<{ module: ModuleRef | null; lessons: T[] }> {
  if (modules.length === 0) {
    return [{ module: null, lessons: orderLessonsForReading(lessons, []) }];
  }
  // A lesson whose module id is not in `modules` is omitted from every group
  // (it would vanish from the UI). This cannot happen under the router's
  // invariant; documented here so the assumption is explicit.
  const sortedModules = [...modules].sort((a, b) => a.order - b.order);
  return sortedModules.map((m) => ({
    module: m,
    lessons: lessons
      .filter((l) => l.module === m.id)
      .sort((a, b) => a.order - b.order),
  }));
}

/**
 * The flat-or-fully-moduled invariant: a course is valid only if it has no
 * moduled lessons (flat) or every lesson is moduled. A mix is forbidden.
 */
export function classroomStructureValid(
  lessons: { module: number | null }[],
): boolean {
  if (lessons.length === 0) return true;
  const moduled = lessons.filter((l) => l.module !== null).length;
  return moduled === 0 || moduled === lessons.length;
}
