import { describe, expect, it } from "vitest";
import {
  courseProgressPercent,
  canCreateCourse,
  youtubeEmbedUrl,
  gradeExam,
  examPassed,
  stripAnswerKey,
  coursePassed,
  type ExamQuestion,
  orderLessonsForReading,
  groupLessonsByModule,
  classroomStructureValid,
} from "./classroom";

const Q: ExamQuestion[] = [
  {
    id: "a",
    prompt: "1+1?",
    type: "single",
    options: ["1", "2", "3"],
    correctIndex: 1,
  },
  {
    id: "b",
    prompt: "Sky is blue?",
    type: "boolean",
    options: ["True", "False"],
    correctIndex: 0,
  },
];

describe("gradeExam", () => {
  it("scores all-correct as 100", () => {
    const r = gradeExam(Q, [
      { questionId: "a", selectedIndex: 1 },
      { questionId: "b", selectedIndex: 0 },
    ]);
    expect(r.score).toBe(100);
    expect(r.correctCount).toBe(2);
    expect(r.wrongQuestionIds).toEqual([]);
  });
  it("scores half-correct as 50 and reports the wrong question", () => {
    const r = gradeExam(Q, [
      { questionId: "a", selectedIndex: 0 },
      { questionId: "b", selectedIndex: 0 },
    ]);
    expect(r.score).toBe(50);
    expect(r.wrongQuestionIds).toEqual(["a"]);
  });
  it("treats a missing or out-of-range answer as wrong", () => {
    const r = gradeExam(Q, [{ questionId: "a", selectedIndex: 99 }]);
    expect(r.score).toBe(0);
    expect(r.wrongQuestionIds).toEqual(["a", "b"]);
  });
  it("ignores answers to unknown questions", () => {
    const r = gradeExam(Q, [
      { questionId: "a", selectedIndex: 1 },
      { questionId: "ghost", selectedIndex: 0 },
      { questionId: "b", selectedIndex: 0 },
    ]);
    expect(r.score).toBe(100);
  });
  it("scores an empty exam as 0", () => {
    expect(gradeExam([], []).score).toBe(0);
  });
});

describe("examPassed", () => {
  it("passes at or above threshold", () => {
    expect(examPassed(80, 80)).toBe(true);
    expect(examPassed(81, 80)).toBe(true);
  });
  it("fails below threshold", () => {
    expect(examPassed(79, 80)).toBe(false);
  });
});

describe("stripAnswerKey", () => {
  it("removes correctIndex from every question", () => {
    const pub = stripAnswerKey(Q);
    expect(pub).toEqual([
      { id: "a", prompt: "1+1?", type: "single", options: ["1", "2", "3"] },
      {
        id: "b",
        prompt: "Sky is blue?",
        type: "boolean",
        options: ["True", "False"],
      },
    ]);
    // @ts-expect-error correctIndex must not exist on the public shape
    expect(pub[0].correctIndex).toBeUndefined();
  });
});

describe("coursePassed", () => {
  it("is true only when every lesson is complete", () => {
    expect(coursePassed(3, 3)).toBe(true);
    expect(coursePassed(2, 3)).toBe(false);
  });
  it("is false for a course with no lessons", () => {
    expect(coursePassed(0, 0)).toBe(false);
  });
});

describe("courseProgressPercent", () => {
  it("is 0 when there are no lessons", () => {
    expect(courseProgressPercent(0, 0)).toBe(0);
  });
  it("is 0 when nothing completed", () => {
    expect(courseProgressPercent(0, 5)).toBe(0);
  });
  it("rounds to nearest percent", () => {
    expect(courseProgressPercent(1, 3)).toBe(33);
    expect(courseProgressPercent(2, 3)).toBe(67);
  });
  it("caps at 100", () => {
    expect(courseProgressPercent(5, 5)).toBe(100);
    expect(courseProgressPercent(6, 5)).toBe(100);
  });
});

describe("canCreateCourse", () => {
  it("allows any active member under all_members", () => {
    expect(canCreateCourse("all_members", "member")).toBe(true);
  });
  it("blocks non-admins under admins_only", () => {
    expect(canCreateCourse("admins_only", "member")).toBe(false);
    expect(canCreateCourse("admins_only", "moderator")).toBe(false);
  });
  it("allows owner/admin under admins_only", () => {
    expect(canCreateCourse("admins_only", "owner")).toBe(true);
    expect(canCreateCourse("admins_only", "admin")).toBe(true);
  });
  it("blocks a non-member regardless of policy", () => {
    expect(canCreateCourse("all_members", null)).toBe(false);
  });
});

describe("youtubeEmbedUrl", () => {
  it("converts watch URLs", () => {
    expect(youtubeEmbedUrl("https://www.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
  });
  it("converts youtu.be URLs", () => {
    expect(youtubeEmbedUrl("https://youtu.be/abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
  });
  it("returns null for non-youtube", () => {
    expect(youtubeEmbedUrl("https://vimeo.com/123")).toBeNull();
  });
  it("returns null for a malformed url", () => {
    expect(youtubeEmbedUrl("not a url")).toBeNull();
  });
});

describe("orderLessonsForReading", () => {
  it("orders a flat course by lesson order alone", () => {
    const lessons = [
      { id: 2, module: null, order: 1 },
      { id: 1, module: null, order: 0 },
    ];
    expect(orderLessonsForReading(lessons, []).map((l) => l.id)).toEqual([
      1, 2,
    ]);
  });

  it("orders a moduled course by (module.order, lesson.order)", () => {
    const lessons = [
      { id: 1, module: 20, order: 0 }, // module B, first
      { id: 2, module: 10, order: 1 }, // module A, second
      { id: 3, module: 10, order: 0 }, // module A, first
    ];
    const modules = [
      { id: 10, title: "A", order: 0 },
      { id: 20, title: "B", order: 1 },
    ];
    expect(orderLessonsForReading(lessons, modules).map((l) => l.id)).toEqual([
      3, 2, 1,
    ]);
  });
});

describe("groupLessonsByModule", () => {
  it("returns a single null-module group for a flat course", () => {
    const lessons = [
      { id: 1, module: null, order: 0 },
      { id: 2, module: null, order: 1 },
    ];
    const groups = groupLessonsByModule(lessons, []);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.module).toBeNull();
    expect(groups[0]!.lessons.map((l) => l.id)).toEqual([1, 2]);
  });

  it("returns one group per module in module order, lessons ordered within", () => {
    const lessons = [
      { id: 1, module: 20, order: 0 },
      { id: 2, module: 10, order: 1 },
      { id: 3, module: 10, order: 0 },
    ];
    const modules = [
      { id: 10, title: "A", order: 0 },
      { id: 20, title: "B", order: 1 },
    ];
    const groups = groupLessonsByModule(lessons, modules);
    expect(groups.map((g) => g.module?.id)).toEqual([10, 20]);
    expect(groups[0]!.lessons.map((l) => l.id)).toEqual([3, 2]);
    expect(groups[1]!.lessons.map((l) => l.id)).toEqual([1]);
  });

  it("includes an empty module (a module with no lessons yet)", () => {
    const groups = groupLessonsByModule([], [{ id: 10, title: "A", order: 0 }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.lessons).toEqual([]);
  });
});

describe("classroomStructureValid", () => {
  it("is valid when all lessons are flat (module null)", () => {
    expect(
      classroomStructureValid([{ module: null }, { module: null }]),
    ).toBe(true);
  });

  it("is valid when every lesson has a module", () => {
    expect(classroomStructureValid([{ module: 10 }, { module: 20 }])).toBe(
      true,
    );
  });

  it("is invalid when some lessons are moduled and some are not", () => {
    expect(classroomStructureValid([{ module: 10 }, { module: null }])).toBe(
      false,
    );
  });

  it("is valid for an empty course", () => {
    expect(classroomStructureValid([])).toBe(true);
  });
});
