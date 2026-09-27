import { describe, expect, it } from "vitest";
import { canPublish, lessonHasContent, publishChecks } from "./publish-checklist";

const text = (s: string) => ({
  root: { type: "root", children: [{ type: "paragraph", children: s ? [{ type: "text", text: s }] : [] }] },
});
const embed = { root: { type: "root", children: [{ type: "classroom-embed", url: "https://x" }] } };
const q = (options: string[], correctIndex: number) => ({ id: "q", prompt: "p", type: "single", options, correctIndex });

describe("lessonHasContent", () => {
  it("is false for a missing body, an empty paragraph, or whitespace", () => {
    expect(lessonHasContent({ id: 1, title: "t", module: null })).toBe(false);
    expect(lessonHasContent({ id: 1, title: "t", module: null, body: text("") })).toBe(false);
    expect(lessonHasContent({ id: 1, title: "t", module: null, body: text("   ") })).toBe(false);
  });
  it("is true for text, any non-paragraph block (embeds, images), resources, or quiz questions", () => {
    expect(lessonHasContent({ id: 1, title: "t", module: null, body: text("Hi") })).toBe(true);
    expect(lessonHasContent({ id: 1, title: "t", module: null, body: embed })).toBe(true);
    expect(lessonHasContent({ id: 1, title: "t", module: null, resources: [{ label: "a", url: "https://a" }] })).toBe(true);
    expect(lessonHasContent({ id: 1, title: "t", module: null, examQuestions: [q(["a", "b"], 0)] })).toBe(true);
  });
  it("tolerates a malformed body", () => {
    expect(lessonHasContent({ id: 1, title: "t", module: null, body: "nonsense" })).toBe(false);
  });

  const lesson = (children: unknown[]) => ({
    id: 1, title: "t", module: null, body: { root: { type: "root", children } },
  });
  it("does not throw on a null or non-object child, and treats it as no content", () => {
    expect(lessonHasContent(lesson([null]))).toBe(false);
    expect(lessonHasContent(lesson([42, "x", { type: "paragraph", children: [null] }]))).toBe(false);
    expect(lessonHasContent(lesson([null, { type: "paragraph", children: [{ type: "text", text: "Hi" }] }]))).toBe(true);
  });
  it("treats an empty heading, quote or list item as empty", () => {
    expect(lessonHasContent(lesson([{ type: "heading", tag: "h2", children: [] }]))).toBe(false);
    expect(lessonHasContent(lesson([{ type: "quote", children: [{ type: "text", text: " " }] }]))).toBe(false);
    expect(
      lessonHasContent(lesson([{ type: "list", children: [{ type: "listitem", children: [] }] }])),
    ).toBe(false);
    expect(lessonHasContent(lesson([{ type: "heading", children: [{ type: "text", text: "Intro" }] }]))).toBe(true);
  });
  it("counts a non-text leaf block (image, divider) as content, even nested", () => {
    expect(lessonHasContent(lesson([{ type: "horizontalrule" }]))).toBe(true);
    expect(lessonHasContent(lesson([{ type: "paragraph", children: [{ type: "image", src: "https://i" }] }]))).toBe(true);
  });
  it("does not count a tab or line break as content", () => {
    expect(lessonHasContent(lesson([{ type: "paragraph", children: [{ type: "tab", text: "\t" }] }]))).toBe(false);
    expect(lessonHasContent(lesson([{ type: "paragraph", children: [{ type: "linebreak" }, { type: "tab" }] }]))).toBe(false);
  });
});

describe("publishChecks", () => {
  const good = {
    title: "Course", coverImageUrl: "https://c",
    lessons: [{ id: 1, title: "L", module: 5, body: text("x"), examQuestions: [q(["a", "b"], 1)] }],
    modules: [{ id: 5, title: "M" }],
  };
  const byId = (input: Parameters<typeof publishChecks>[0]) =>
    Object.fromEntries(publishChecks(input).map((r) => [r.id, r]));

  it("passes a complete course", () => {
    expect(canPublish(publishChecks(good))).toBe(true);
  });
  it("blocks with no lessons", () => {
    const r = byId({ ...good, lessons: [], modules: [] });
    expect(r.hasLessons).toMatchObject({ ok: false, level: "block" });
  });
  it("blocks on empty lessons and names them", () => {
    const r = byId({ ...good, lessons: [...good.lessons, { id: 2, title: "E", module: 5 }] });
    expect(r.noEmptyLessons).toMatchObject({ ok: false, level: "block", lessonIds: [2] });
  });
  it("blocks when a quiz answer index is out of range or an option is blank", () => {
    expect(byId({ ...good, lessons: [{ ...good.lessons[0]!, examQuestions: [q(["a", "b"], 2)] }]}).quizAnswers)
      .toMatchObject({ ok: false, lessonIds: [1] });
    expect(byId({ ...good, lessons: [{ ...good.lessons[0]!, examQuestions: [q(["a", " "], 0)] }]}).quizAnswers)
      .toMatchObject({ ok: false });
  });
  it("blocks when a quiz question prompt is blank", () => {
    expect(
      byId({ ...good, lessons: [{ ...good.lessons[0]!, examQuestions: [{ ...q(["a", "b"], 0), prompt: "  " }] }] })
        .quizAnswers,
    ).toMatchObject({ ok: false, lessonIds: [1] });
  });
  it("blocks, without throwing, when a quiz question entry is null or not an object", () => {
    expect(byId({ ...good, lessons: [{ ...good.lessons[0]!, examQuestions: [null] }] }).quizAnswers)
      .toMatchObject({ ok: false, lessonIds: [1] });
    expect(byId({ ...good, lessons: [{ ...good.lessons[0]!, examQuestions: [q(["a", "b"], 0), "x"] }] }).quizAnswers)
      .toMatchObject({ ok: false, lessonIds: [1] });
  });
  it("blocks on empty modules and names them", () => {
    const r = byId({ ...good, modules: [...good.modules, { id: 6, title: "Empty" }] });
    expect(r.noEmptyModules).toMatchObject({ ok: false, moduleIds: [6] });
  });
  it("only warns about a missing cover", () => {
    const results = publishChecks({ ...good, coverImageUrl: null });
    expect(results.find((r) => r.id === "cover")).toMatchObject({ ok: false, level: "warn" });
    expect(canPublish(results)).toBe(true);
  });
  it("blocks a blank title", () => {
    expect(byId({ ...good, title: "  " }).title).toMatchObject({ ok: false, level: "block" });
  });
});
