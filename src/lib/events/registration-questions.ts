import { z } from "zod";

import { eventStartInstant } from "@/lib/event-time";

/**
 * Registration questions (ADR-0038, #369): the event organizer asks up to
 * ten questions; members answer them when they register and may change the
 * answers until the event starts; the organizer sees them in the attendee
 * list and the CSV.
 *
 * Shared by browser and server: the register dialog validates with the same
 * `validateAnswers` the server enforces, so a member sees the same rule the
 * server applies. Questions and options carry stable ids, so fixing a typo in
 * a question keeps the answers attached to it.
 */

export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "single_choice",
  "multi_choice",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const MAX_QUESTIONS = 10;
export const MAX_OPTIONS = 20;
export const QUESTION_LABEL_MAX = 200;
export const OPTION_LABEL_MAX = 100;
export const SHORT_ANSWER_MAX = 300;
export const LONG_ANSWER_MAX = 2000;

const id = z.string().trim().min(1).max(40);
const label = z.string().trim().min(1).max(QUESTION_LABEL_MAX);
const option = z.object({
  id,
  label: z.string().trim().min(1).max(OPTION_LABEL_MAX),
});
const options = z
  .array(option)
  .min(2)
  .max(MAX_OPTIONS)
  .refine((list) => new Set(list.map((o) => o.id)).size === list.length, {
    message: "Option ids must be unique.",
  });

export const registrationQuestionSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("short_text"), label, required: z.boolean() }),
  z.object({ id, type: z.literal("long_text"), label, required: z.boolean() }),
  z.object({
    id,
    type: z.literal("single_choice"),
    label,
    required: z.boolean(),
    options,
  }),
  z.object({
    id,
    type: z.literal("multi_choice"),
    label,
    required: z.boolean(),
    options,
  }),
]);
export type RegistrationQuestion = z.infer<typeof registrationQuestionSchema>;

export const registrationQuestionsSchema = z
  .array(registrationQuestionSchema)
  .max(MAX_QUESTIONS)
  .refine((list) => new Set(list.map((q) => q.id)).size === list.length, {
    message: "Question ids must be unique.",
  });

/**
 * Questions as stored on an event. Payload keeps them as JSON, so anything
 * that does not match the schema (a hand edit in the admin panel, an old
 * shape) reads as "no questions" rather than breaking registration.
 */
export function parseStoredQuestions(value: unknown): RegistrationQuestion[] {
  const parsed = registrationQuestionsSchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}

/** The message `events.register` / `updateMyAnswers` refuse bad answers with. */
export const ANSWERS_INVALID = "ANSWERS_INVALID";

/** A text answer, or the chosen option id(s). */
export type AnswerValue = string | string[];
export type RegistrationAnswers = Record<string, AnswerValue>;

/** The shape answers travel in, before `validateAnswers` checks them. */
export const answersInputSchema = z
  .record(
    z.string().max(40),
    z.union([
      z.string().max(LONG_ANSWER_MAX + 100),
      z.array(z.string().max(40)).max(MAX_OPTIONS),
    ]),
  )
  .refine((record) => Object.keys(record).length <= MAX_QUESTIONS * 2, {
    message: "Too many answers.",
  });

export type AnswerProblem = "required" | "too_long" | "invalid_choice";

export type AnswersCheck =
  | { ok: true; answers: RegistrationAnswers }
  | { ok: false; problems: Record<string, AnswerProblem> };

/**
 * Check answers against the event's questions and return them cleaned:
 * text trimmed, empty answers dropped, choices limited to the question's own
 * options (multi-choice de-duplicated, in the organizer's order), answers to
 * questions that no longer exist dropped.
 */
export function validateAnswers(
  questions: readonly RegistrationQuestion[],
  input: Readonly<Record<string, unknown>>,
): AnswersCheck {
  const answers: RegistrationAnswers = {};
  const problems: Record<string, AnswerProblem> = {};

  for (const question of questions) {
    const raw = input[question.id];

    if (question.type === "short_text" || question.type === "long_text") {
      const text = typeof raw === "string" ? raw.trim() : "";
      const max =
        question.type === "short_text" ? SHORT_ANSWER_MAX : LONG_ANSWER_MAX;
      if (text.length > max) problems[question.id] = "too_long";
      else if (text) answers[question.id] = text;
      else if (question.required) problems[question.id] = "required";
      continue;
    }

    const chosen = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(
      (value): value is string => typeof value === "string" && value !== "",
    );
    const known = new Set(question.options.map((o) => o.id));
    if (chosen.some((value) => !known.has(value))) {
      problems[question.id] = "invalid_choice";
      continue;
    }
    if (question.type === "single_choice") {
      if (chosen.length > 1) problems[question.id] = "invalid_choice";
      else if (chosen[0]) answers[question.id] = chosen[0];
      else if (question.required) problems[question.id] = "required";
      continue;
    }
    const picked = question.options
      .map((o) => o.id)
      .filter((optionId) => chosen.includes(optionId));
    if (picked.length > 0) answers[question.id] = picked;
    else if (question.required) problems[question.id] = "required";
  }

  return Object.keys(problems).length > 0
    ? { ok: false, problems }
    : { ok: true, answers };
}

/** One answer as the organizer reads it: choice ids turned into their words. */
export interface ResolvedAnswer {
  questionId: string;
  question: string;
  type: QuestionType;
  /** Text, or the chosen options' labels. */
  value: string | string[];
}

/**
 * Stored answers against the event's current questions, in question order.
 * Questions the member left empty, answers to removed questions, and
 * choices of removed options are left out.
 */
export function resolveAnswers(
  questions: readonly RegistrationQuestion[],
  stored: unknown,
): ResolvedAnswer[] {
  const answers =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  return questions.flatMap((question): ResolvedAnswer[] => {
    const raw = answers[question.id];
    if (question.type === "short_text" || question.type === "long_text") {
      return typeof raw === "string" && raw
        ? [
            {
              questionId: question.id,
              question: question.label,
              type: question.type,
              value: raw,
            },
          ]
        : [];
    }
    const ids = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
    const labels = question.options
      .filter((o) => ids.includes(o.id))
      .map((o) => o.label);
    if (labels.length === 0) return [];
    return [
      {
        questionId: question.id,
        question: question.label,
        type: question.type,
        value: question.type === "single_choice" ? labels[0]! : labels,
      },
    ];
  });
}

/**
 * Whether a member may still change their answers: until the event starts,
 * in its own zone (a date-only event starts at local midnight). After that
 * the answers are what the organizer planned with. A corrupt date: no.
 */
export function canChangeAnswers(
  event: {
    date: string;
    startTime?: string | null;
    timezone?: string | null;
  },
  now: Date = new Date(),
): boolean {
  const start = eventStartInstant(event);
  return start !== null && now.getTime() < start.getTime();
}
