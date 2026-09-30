import { describe, expect, it } from "vitest";

import {
  addOption,
  addQuestion,
  changeType,
  moveQuestion,
  questionProblems,
  removeOption,
  removeQuestion,
  updateOption,
  updateQuestion,
} from "./questions-editor-model";

function ids() {
  let n = 0;
  return () => `id${++n}`;
}

describe("the question editor's steps", () => {
  it("adds a blank short-text question, up to ten", () => {
    const newId = ids();
    let list = addQuestion([], newId);
    expect(list).toEqual([
      { id: "id1", type: "short_text", label: "", required: false },
    ]);
    for (let i = 0; i < 12; i++) list = addQuestion(list, newId);
    expect(list).toHaveLength(10);
  });

  it("turns text into a choice with two empty options, and back", () => {
    const newId = ids();
    let list = updateQuestion(addQuestion([], newId), 0, { label: "Level" });
    list = changeType(list, 0, "single_choice", newId);
    expect(list[0]).toEqual({
      id: "id1",
      type: "single_choice",
      label: "Level",
      required: false,
      options: [
        { id: "id2", label: "" },
        { id: "id3", label: "" },
      ],
    });
    list = changeType(list, 0, "multi_choice", newId);
    expect(list[0]).toMatchObject({
      type: "multi_choice",
      options: [{ id: "id2" }, { id: "id3" }],
    });
    list = changeType(list, 0, "long_text", newId);
    expect(list[0]).toEqual({
      id: "id1",
      type: "long_text",
      label: "Level",
      required: false,
    });
  });

  it("edits, adds and removes options", () => {
    const newId = ids();
    let list = changeType(addQuestion([], newId), 0, "single_choice", newId);
    list = updateOption(list, 0, 1, "Daily");
    list = addOption(list, 0, newId);
    list = removeOption(list, 0, 0);
    expect(list[0]).toMatchObject({
      options: [
        { id: "id3", label: "Daily" },
        { id: "id4", label: "" },
      ],
    });
  });

  it("moves and removes questions", () => {
    const newId = ids();
    let list = addQuestion(addQuestion(addQuestion([], newId), newId), newId);
    list = moveQuestion(list, 2, -1);
    expect(list.map((q) => q.id)).toEqual(["id1", "id3", "id2"]);
    expect(moveQuestion(list, 0, -1).map((q) => q.id)).toEqual([
      "id1",
      "id3",
      "id2",
    ]);
    list = removeQuestion(list, 0);
    expect(list.map((q) => q.id)).toEqual(["id3", "id2"]);
  });
});

describe("questionProblems", () => {
  it("is empty when the server would accept the list", () => {
    const newId = ids();
    const list = updateQuestion(addQuestion([], newId), 0, {
      label: "Company",
    });
    expect(questionProblems(list)).toEqual({});
  });

  it("names a blank question, too few options and a blank option", () => {
    const newId = ids();
    let list = addQuestion(addQuestion([], newId), newId);
    list = updateQuestion(list, 1, { label: "Level" });
    list = changeType(list, 1, "single_choice", newId);
    list = updateOption(list, 1, 0, "New");
    expect(questionProblems(list)).toEqual({
      0: ["label"],
      1: ["optionLabel"],
    });
    list = removeOption(list, 1, 1);
    expect(questionProblems(list)[1]).toEqual(["options"]);
  });
});
