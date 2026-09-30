import { describe, expect, it } from "vitest";

import { editorChecklist, finishedSections } from "./editor-checklist";
import { emptyEventFormData } from "./event-form-model";

const READY = {
  ...emptyEventFormData,
  title: "Builders night",
  audience: ["builders"],
  date: "2026-11-02",
  location: "Amsterdam",
};

describe("editorChecklist", () => {
  it("lists what a new event still needs", () => {
    expect(
      editorChecklist(emptyEventFormData, "create").map((i) => [i.id, i.done]),
    ).toEqual([
      ["title", false],
      ["audience", false],
      ["date", false],
      ["location", false],
    ]);
  });

  it("is all done for a complete event", () => {
    expect(editorChecklist(READY, "create").every((i) => i.done)).toBe(true);
  });

  it("wants a title of at least three characters", () => {
    expect(
      editorChecklist({ ...READY, title: " ab " }, "create")[0],
    ).toMatchObject({ id: "title", done: false });
  });

  it("checks the questions only when there are some to check", () => {
    const withBlank = {
      ...READY,
      registrationQuestions: [
        { id: "q1", type: "short_text" as const, label: "", required: false },
      ],
    };
    expect(editorChecklist(withBlank, "create").at(-1)).toEqual({
      id: "questions",
      section: "registration",
      done: false,
    });
    // An event people register for elsewhere asks no questions here.
    expect(
      editorChecklist(
        { ...withBlank, sourceUrl: "https://lu.ma/x" },
        "create",
      ).map((i) => i.id),
    ).not.toContain("questions");
  });

  it("does not demand an audience when editing an event that has none", () => {
    expect(
      editorChecklist({ ...READY, audience: [] }, "edit").map((i) => i.id),
    ).not.toContain("audience");
  });
});

describe("finishedSections", () => {
  it("ticks only sections whose items are all done", () => {
    const items = editorChecklist({ ...READY, location: "" }, "create");
    expect([...finishedSections(items)].sort()).toEqual([
      "audience",
      "basics",
      "when",
    ]);
  });
});
