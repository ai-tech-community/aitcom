import {
  MAX_OPTIONS,
  MAX_QUESTIONS,
  registrationQuestionsSchema,
  type QuestionType,
  type RegistrationQuestion,
} from "@/lib/events/registration-questions";

/**
 * Editing a list of registration questions, as pure steps the question
 * editor calls. Ids come from `newId` (the caller passes crypto.randomUUID),
 * so tests stay deterministic.
 */

type NewId = () => string;

const isChoice = (
  type: QuestionType,
): type is "single_choice" | "multi_choice" =>
  type === "single_choice" || type === "multi_choice";

export function addQuestion(
  list: readonly RegistrationQuestion[],
  newId: NewId,
): RegistrationQuestion[] {
  if (list.length >= MAX_QUESTIONS) return [...list];
  return [
    ...list,
    { id: newId(), type: "short_text", label: "", required: false },
  ];
}

export function updateQuestion(
  list: readonly RegistrationQuestion[],
  index: number,
  patch: { label?: string; required?: boolean },
): RegistrationQuestion[] {
  return list.map((q, i) => (i === index ? { ...q, ...patch } : q));
}

/**
 * Change a question's kind. Text → choice starts two empty options; choice
 * → choice keeps them; choice → text drops them.
 */
export function changeType(
  list: readonly RegistrationQuestion[],
  index: number,
  type: QuestionType,
  newId: NewId,
): RegistrationQuestion[] {
  return list.map((q, i): RegistrationQuestion => {
    if (i !== index || q.type === type) return q;
    const base = { id: q.id, label: q.label, required: q.required };
    if (!isChoice(type)) return { ...base, type };
    const options =
      "options" in q
        ? q.options
        : [
            { id: newId(), label: "" },
            { id: newId(), label: "" },
          ];
    return { ...base, type, options };
  });
}

export function removeQuestion(
  list: readonly RegistrationQuestion[],
  index: number,
): RegistrationQuestion[] {
  return list.filter((_, i) => i !== index);
}

/** Move a question up (-1) or down (+1); no-op at the ends. */
export function moveQuestion(
  list: readonly RegistrationQuestion[],
  index: number,
  by: -1 | 1,
): RegistrationQuestion[] {
  const target = index + by;
  if (target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

function withOptions(
  list: readonly RegistrationQuestion[],
  index: number,
  change: (
    options: { id: string; label: string }[],
  ) => { id: string; label: string }[],
): RegistrationQuestion[] {
  return list.map((q, i) =>
    i === index && "options" in q ? { ...q, options: change(q.options) } : q,
  );
}

export const addOption = (
  list: readonly RegistrationQuestion[],
  index: number,
  newId: NewId,
) =>
  withOptions(list, index, (options) =>
    options.length >= MAX_OPTIONS
      ? options
      : [...options, { id: newId(), label: "" }],
  );

export const updateOption = (
  list: readonly RegistrationQuestion[],
  index: number,
  optionIndex: number,
  label: string,
) =>
  withOptions(list, index, (options) =>
    options.map((o, i) => (i === optionIndex ? { ...o, label } : o)),
  );

export const removeOption = (
  list: readonly RegistrationQuestion[],
  index: number,
  optionIndex: number,
) =>
  withOptions(list, index, (options) =>
    options.filter((_, i) => i !== optionIndex),
  );

export type QuestionProblem = "label" | "options" | "optionLabel";

/**
 * What stops the list from saving, per question, in words the editor can
 * translate: a blank question, fewer than two options, or a blank option.
 * Empty when the server's own schema accepts the list.
 */
export function questionProblems(
  list: readonly RegistrationQuestion[],
): Record<number, QuestionProblem[]> {
  const parsed = registrationQuestionsSchema.safeParse(list);
  if (parsed.success) return {};
  const problems: Record<number, Set<QuestionProblem>> = {};
  for (const issue of parsed.error.issues) {
    const [index, field] = issue.path;
    if (typeof index !== "number") continue;
    const problem: QuestionProblem =
      field === "label"
        ? "label"
        : issue.path.length > 3
          ? "optionLabel"
          : "options";
    (problems[index] ??= new Set()).add(problem);
  }
  return Object.fromEntries(
    Object.entries(problems).map(([i, set]) => [Number(i), [...set]]),
  );
}
