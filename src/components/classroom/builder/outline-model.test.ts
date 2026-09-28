import { describe, expect, it } from "vitest";
import {
  applyLessonMove,
  buildOutline,
  moveByStep,
  nextModuleTitle,
  readingOrder,
} from "./outline-model";

const modules = [
  { id: 10, title: "Basics", order: 0 },
  { id: 20, title: "Advanced", order: 1 },
  { id: 30, title: "Empty", order: 2 },
];
const lessons = [
  { id: 1, title: "a", module: 10, order: 0 },
  { id: 2, title: "b", module: 10, order: 1 },
  { id: 3, title: "c", module: 20, order: 0 },
];

describe("buildOutline", () => {
  it("groups by module in module order, keeping empty modules", () => {
    expect(
      buildOutline(lessons, modules).map((g) => [g.moduleId, g.lessonIds]),
    ).toEqual([
      [10, [1, 2]],
      [20, [3]],
      [30, []],
    ]);
  });
  it("returns one flat group when there are no modules", () => {
    const flat = lessons.map((l, i) => ({ ...l, module: null, order: 2 - i }));
    expect(buildOutline(flat, [])).toEqual([
      { moduleId: null, title: null, summary: null, lessonIds: [3, 2, 1] },
    ]);
  });
});

describe("applyLessonMove", () => {
  const groups = buildOutline(lessons, modules);
  it("reorders inside one module", () => {
    const r = applyLessonMove(groups, 2, { moduleId: 10, index: 0 })!;
    expect(r.move).toEqual({ moduleId: 10, orderedIds: [2, 1] });
    expect(r.groups[0]!.lessonIds).toEqual([2, 1]);
  });
  it("moves across modules and reports the target container's full order", () => {
    const r = applyLessonMove(groups, 1, { moduleId: 20, index: 1 })!;
    expect(r.move).toEqual({ moduleId: 20, orderedIds: [3, 1] });
    expect(r.groups[0]!.lessonIds).toEqual([2]);
  });
  it("moves into an empty module", () => {
    expect(
      applyLessonMove(groups, 3, { moduleId: 30, index: 0 })!.move,
    ).toEqual({ moduleId: 30, orderedIds: [3] });
  });
  it("clamps an index past the end", () => {
    expect(
      applyLessonMove(groups, 1, { moduleId: 20, index: 99 })!.move.orderedIds,
    ).toEqual([3, 1]);
  });
  it("returns null for a no-op and for an unknown lesson or module", () => {
    expect(applyLessonMove(groups, 1, { moduleId: 10, index: 0 })).toBeNull();
    expect(applyLessonMove(groups, 999, { moduleId: 10, index: 0 })).toBeNull();
    expect(applyLessonMove(groups, 1, { moduleId: 999, index: 0 })).toBeNull();
  });
  it("returns an orderedIds array that does not alias the new groups", () => {
    const r = applyLessonMove(groups, 1, { moduleId: 20, index: 0 })!;
    r.move.orderedIds.push(999);
    expect(r.groups[1]!.lessonIds).toEqual([1, 3]);
    expect(groups[1]!.lessonIds).toEqual([3]);
  });
  it("does not mutate its input", () => {
    const snapshot = JSON.stringify(groups);
    applyLessonMove(groups, 1, { moduleId: 20, index: 0 });
    expect(JSON.stringify(groups)).toBe(snapshot);
  });
});

describe("moveByStep", () => {
  const groups = buildOutline(lessons, modules);
  it("moves down within a module", () => {
    expect(moveByStep(groups, 1, 1)!.move).toEqual({
      moduleId: 10,
      orderedIds: [2, 1],
    });
  });
  it("moving down from the last slot enters the next module at the top", () => {
    expect(moveByStep(groups, 2, 1)!.move).toEqual({
      moduleId: 20,
      orderedIds: [2, 3],
    });
  });
  it("moving up from the first slot enters the previous module at the bottom", () => {
    expect(moveByStep(groups, 3, -1)!.move).toEqual({
      moduleId: 10,
      orderedIds: [1, 2, 3],
    });
  });
  it("skips nothing: moving down from the last lesson of the last non-empty module enters the empty module", () => {
    expect(moveByStep(groups, 3, 1)!.move).toEqual({
      moduleId: 30,
      orderedIds: [3],
    });
  });
  it("returns null at the very top and very bottom", () => {
    expect(moveByStep(groups, 1, -1)).toBeNull();
    const flat = buildOutline(
      [{ id: 1, title: "a", module: null, order: 0 }],
      [],
    );
    expect(moveByStep(flat, 1, 1)).toBeNull();
  });
});

describe("readingOrder", () => {
  it("flattens groups in display order", () => {
    expect(readingOrder(buildOutline(lessons, modules))).toEqual([1, 2, 3]);
  });
});

describe("nextModuleTitle", () => {
  it("numbers after the existing modules", () => {
    expect(nextModuleTitle("Module", [])).toBe("Module 1");
    expect(nextModuleTitle("Module", ["Module 1", "Module 2"])).toBe(
      "Module 3",
    );
  });
  it("skips a number already used after a delete", () => {
    // "Module 2" was deleted: two modules left, but "Module 3" is taken.
    expect(nextModuleTitle("Module", ["Module 1", "Module 3"])).toBe(
      "Module 4",
    );
    expect(nextModuleTitle("Module", ["Intro", "Module 3", "Module 4"])).toBe(
      "Module 5",
    );
  });
  it("ignores renamed modules and surrounding spaces", () => {
    expect(nextModuleTitle("Module", ["Basics", " Module 2 "])).toBe(
      "Module 3",
    );
    expect(nextModuleTitle("Module", ["Basics", "Advanced"])).toBe("Module 3");
  });
});
