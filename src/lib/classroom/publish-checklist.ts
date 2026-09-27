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

/** Leaf nodes that only shape whitespace; on their own they are not content. */
const WHITESPACE_LEAVES = new Set(["text", "tab", "linebreak"]);

/**
 * True when a Lexical node holds something a learner would see:
 * - a node with children (paragraph, heading, quote, list item…) only when one of its children does;
 * - a text leaf only when its text is not blank;
 * - any other typed leaf (embed, image, divider…) always.
 * Malformed entries (null, numbers, strings) count as nothing.
 */
function nodeHasContent(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const { type, text, children } = node as LexicalNode;
  if (typeof text === "string" && text.trim() !== "") return true;
  if (Array.isArray(children)) return children.some(nodeHasContent);
  return typeof type === "string" && !WHITESPACE_LEAVES.has(type);
}

type ExamQuestion = { prompt?: unknown; options?: unknown; correctIndex?: unknown };

/** Raw stored entries; any one may be malformed, so callers check each before use. */
function questionsOf(lesson: ChecklistLesson): unknown[] {
  return Array.isArray(lesson.examQuestions) ? lesson.examQuestions : [];
}

export function lessonHasContent(lesson: ChecklistLesson): boolean {
  if ((lesson.resources?.length ?? 0) > 0) return true;
  if (questionsOf(lesson).length > 0) return true;
  const body = lesson.body as { root?: LexicalNode } | null | undefined;
  return !!body && typeof body === "object" && !!body.root && nodeHasContent(body.root);
}

function questionValid(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const { prompt, options, correctIndex } = entry as ExamQuestion;
  return (
    typeof prompt === "string" &&
    prompt.trim() !== "" &&
    Array.isArray(options) &&
    options.length >= 2 &&
    options.every((o) => typeof o === "string" && o.trim() !== "") &&
    typeof correctIndex === "number" &&
    Number.isInteger(correctIndex) &&
    correctIndex >= 0 &&
    correctIndex < options.length
  );
}

function quizValid(lesson: ChecklistLesson): boolean {
  return questionsOf(lesson).every(questionValid);
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
