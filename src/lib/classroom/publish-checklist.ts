/**
 * What must be true before a course goes live. Pure, so the publish dialog
 * and any future server-side check share one definition.
 */
export type ChecklistLesson = {
  id: number;
  title: string;
  module: number | null;
  body?: unknown;
  resources?: { label: string; url: string }[] | null;
  examQuestions?: unknown;
};
export type ChecklistInput = {
  title: string;
  coverImageUrl: string | null;
  lessons: ChecklistLesson[];
  modules: { id: number; title: string }[];
};
export type CheckId = "title" | "hasLessons" | "noEmptyLessons" | "quizAnswers" | "noEmptyModules" | "cover";
export type CheckResult = {
  id: CheckId;
  level: "block" | "warn";
  ok: boolean;
  lessonIds?: number[];
  moduleIds?: number[];
};

type LexicalNode = { type?: unknown; text?: unknown; children?: unknown };

/** True when a Lexical tree holds visible text or any non-paragraph block (embed, image, list…). */
function nodeHasContent(node: LexicalNode): boolean {
  if (typeof node.text === "string" && node.text.trim() !== "") return true;
  const structural = node.type === "root" || node.type === "paragraph" || node.type === "text" || node.type === "linebreak";
  if (typeof node.type === "string" && !structural) return true;
  return Array.isArray(node.children) && node.children.some((c) => nodeHasContent(c as LexicalNode));
}

type ExamQuestion = { prompt?: unknown; options: string[]; correctIndex: number };

function questionsOf(lesson: ChecklistLesson): ExamQuestion[] {
  return Array.isArray(lesson.examQuestions) ? (lesson.examQuestions as ExamQuestion[]) : [];
}

export function lessonHasContent(lesson: ChecklistLesson): boolean {
  if ((lesson.resources?.length ?? 0) > 0) return true;
  if (questionsOf(lesson).length > 0) return true;
  const body = lesson.body as { root?: LexicalNode } | null | undefined;
  return !!body && typeof body === "object" && !!body.root && nodeHasContent(body.root);
}

function quizValid(lesson: ChecklistLesson): boolean {
  return questionsOf(lesson).every(
    (q) =>
      typeof q.prompt === "string" &&
      q.prompt.trim() !== "" &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      q.options.every((o) => typeof o === "string" && o.trim() !== "") &&
      Number.isInteger(q.correctIndex) &&
      q.correctIndex >= 0 &&
      q.correctIndex < q.options.length,
  );
}

export function publishChecks(input: ChecklistInput): CheckResult[] {
  const empty = input.lessons.filter((l) => !lessonHasContent(l)).map((l) => l.id);
  const badQuiz = input.lessons.filter((l) => !quizValid(l)).map((l) => l.id);
  const used = new Set(input.lessons.map((l) => l.module));
  const emptyModules = input.modules.filter((mod) => !used.has(mod.id)).map((mod) => mod.id);
  return [
    { id: "title", level: "block", ok: input.title.trim().length >= 3 },
    { id: "hasLessons", level: "block", ok: input.lessons.length > 0 },
    { id: "noEmptyLessons", level: "block", ok: empty.length === 0, lessonIds: empty },
    { id: "quizAnswers", level: "block", ok: badQuiz.length === 0, lessonIds: badQuiz },
    { id: "noEmptyModules", level: "block", ok: emptyModules.length === 0, moduleIds: emptyModules },
    { id: "cover", level: "warn", ok: !!input.coverImageUrl },
  ];
}

export function canPublish(results: CheckResult[]): boolean {
  return results.every((r) => r.ok || r.level === "warn");
}
