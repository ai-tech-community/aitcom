import { describe, expect, it } from "vitest";
import {
  canChangeAnswers,
  parseStoredQuestions,
  registrationQuestionsSchema,
  resolveAnswers,
  validateAnswers,
  type RegistrationQuestion,
} from "./registration-questions";

const QUESTIONS: RegistrationQuestion[] = [
  {
    id: "hope",
    type: "long_text",
    label: "What do you hope to learn?",
    required: true,
  },
  { id: "company", type: "short_text", label: "Company", required: false },
  {
    id: "level",
    type: "single_choice",
    label: "Your AI experience",
    required: true,
    options: [
      { id: "new", label: "New to it" },
      { id: "some", label: "Some" },
      { id: "pro", label: "I build with it daily" },
    ],
  },
  {
    id: "topics",
    type: "multi_choice",
    label: "Topics",
    required: false,
    options: [
      { id: "rag", label: "RAG" },
      { id: "agents", label: "Agents" },
      { id: "evals", label: "Evals" },
    ],
  },
];

describe("registrationQuestionsSchema", () => {
  it("accepts the organizer's questions", () => {
    expect(registrationQuestionsSchema.safeParse(QUESTIONS).success).toBe(true);
  });

  it("refuses a choice question with one option", () => {
    const q = { ...QUESTIONS[2]!, options: [{ id: "a", label: "A" }] };
    expect(registrationQuestionsSchema.safeParse([q]).success).toBe(false);
  });

  it("refuses duplicate question or option ids", () => {
    expect(
      registrationQuestionsSchema.safeParse([QUESTIONS[0], QUESTIONS[0]])
        .success,
    ).toBe(false);
    const dupOptions = {
      ...QUESTIONS[2]!,
      options: [
        { id: "a", label: "A" },
        { id: "a", label: "B" },
      ],
    };
    expect(registrationQuestionsSchema.safeParse([dupOptions]).success).toBe(
      false,
    );
  });

  it("refuses more than ten questions and blank labels", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      ...QUESTIONS[1]!,
      id: `q${i}`,
    }));
    expect(registrationQuestionsSchema.safeParse(many).success).toBe(false);
    expect(
      registrationQuestionsSchema.safeParse([{ ...QUESTIONS[1]!, label: " " }])
        .success,
    ).toBe(false);
  });
});

describe("parseStoredQuestions", () => {
  it("reads nothing from a missing or broken value", () => {
    expect(parseStoredQuestions(null)).toEqual([]);
    expect(parseStoredQuestions({ not: "a list" })).toEqual([]);
    expect(parseStoredQuestions([{ id: "x", type: "rating" }])).toEqual([]);
  });
});

describe("validateAnswers", () => {
  it("cleans valid answers", () => {
    expect(
      validateAnswers(QUESTIONS, {
        hope: "  Ship an agent  ",
        company: "",
        level: "some",
        topics: ["evals", "rag", "rag"],
        removed: "answer to a question that is gone",
      }),
    ).toEqual({
      ok: true,
      answers: {
        hope: "Ship an agent",
        level: "some",
        topics: ["rag", "evals"],
      },
    });
  });

  it("names every missing required answer", () => {
    expect(validateAnswers(QUESTIONS, { hope: "   " })).toEqual({
      ok: false,
      problems: { hope: "required", level: "required" },
    });
  });

  it("refuses choices that are not the question's options", () => {
    expect(
      validateAnswers(QUESTIONS, {
        hope: "x",
        level: "expert",
        topics: ["rag", "crypto"],
      }),
    ).toEqual({
      ok: false,
      problems: { level: "invalid_choice", topics: "invalid_choice" },
    });
  });

  it("refuses two picks for a single choice", () => {
    expect(
      validateAnswers(QUESTIONS, { hope: "x", level: ["new", "pro"] }),
    ).toMatchObject({ ok: false, problems: { level: "invalid_choice" } });
  });

  it("refuses text over the limit", () => {
    expect(
      validateAnswers(QUESTIONS, {
        hope: "x",
        level: "new",
        company: "y".repeat(301),
      }),
    ).toMatchObject({ ok: false, problems: { company: "too_long" } });
  });

  it("asks nothing when the event has no questions", () => {
    expect(validateAnswers([], { stray: "value" })).toEqual({
      ok: true,
      answers: {},
    });
  });
});

describe("resolveAnswers", () => {
  it("gives the organizer words, in question order", () => {
    expect(
      resolveAnswers(QUESTIONS, {
        topics: ["rag", "evals"],
        level: "pro",
        hope: "Ship an agent",
      }),
    ).toEqual([
      {
        questionId: "hope",
        question: "What do you hope to learn?",
        type: "long_text",
        value: "Ship an agent",
      },
      {
        questionId: "level",
        question: "Your AI experience",
        type: "single_choice",
        value: "I build with it daily",
      },
      {
        questionId: "topics",
        question: "Topics",
        type: "multi_choice",
        value: ["RAG", "Evals"],
      },
    ]);
  });

  it("follows a renamed question and drops removed options and questions", () => {
    const renamed = QUESTIONS.map((q) =>
      q.id === "hope" ? { ...q, label: "What do you want to learn?" } : q,
    ).filter((q) => q.id !== "company");
    expect(
      resolveAnswers(renamed, {
        hope: "Agents",
        company: "Acme",
        level: "gone",
      }),
    ).toEqual([
      {
        questionId: "hope",
        question: "What do you want to learn?",
        type: "long_text",
        value: "Agents",
      },
    ]);
  });

  it("reads nothing from broken stored answers", () => {
    expect(resolveAnswers(QUESTIONS, null)).toEqual([]);
    expect(resolveAnswers(QUESTIONS, ["x"])).toEqual([]);
  });
});

describe("canChangeAnswers", () => {
  const EVENT = {
    date: "2026-10-05T00:00:00.000Z",
    startTime: "20:00",
    timezone: "Europe/Amsterdam",
  };

  it("allows changes until the event starts where it happens", () => {
    // 20:00 CEST is 18:00 UTC.
    expect(canChangeAnswers(EVENT, new Date("2026-10-05T17:59:00Z"))).toBe(
      true,
    );
    expect(canChangeAnswers(EVENT, new Date("2026-10-05T18:00:00Z"))).toBe(
      false,
    );
  });

  it("closes a date-only event at its local midnight", () => {
    const dateOnly = { ...EVENT, startTime: null };
    expect(canChangeAnswers(dateOnly, new Date("2026-10-04T21:59:00Z"))).toBe(
      true,
    );
    expect(canChangeAnswers(dateOnly, new Date("2026-10-04T22:00:00Z"))).toBe(
      false,
    );
  });

  it("refuses a corrupt date", () => {
    expect(canChangeAnswers({ ...EVENT, date: "soon" })).toBe(false);
  });
});
