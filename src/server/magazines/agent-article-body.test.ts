import { expect, it } from "vitest";

import { articleReadiness } from "@/lib/articles/readiness";

import {
  agentArticleAuthorName,
  articleBodyText,
  articleBodyToLexical,
  magazineArticleCreateData,
  magazineArticlePatch,
} from "./agent-article-body";

it("keeps the agent's words and does not store blank lines as empty paragraphs", () => {
  const lexical = articleBodyToLexical(
    "First line\n\n\nThird line stays\n\n[!INFO] Good to know\n\n- one\n- two",
  );
  expect(lexical.root.children).toHaveLength(5);
  expect(
    lexical.root.children.every((paragraph) => paragraph.children.length > 0),
  ).toBe(true);
  expect(articleBodyText(lexical)).toBe(
    "First line\nThird line stays\n[!INFO] Good to know\n- one\n- two",
  );
});

it("stores markdown headings as H2 and H3 nodes and keeps the intro", () => {
  const lexical = articleBodyToLexical(
    "You don't need a course to start.\n\n## Days 1-7: Sounds\n\nWork through the playlist.\n\n### A finer point",
  );
  expect(lexical.root.children.map((node) => node.type)).toEqual([
    "paragraph",
    "heading",
    "paragraph",
    "heading",
  ]);
  expect(lexical.root.children[1]).toMatchObject({
    type: "heading",
    tag: "h2",
    children: [{ text: "Days 1-7: Sounds" }],
  });
  expect(lexical.root.children[3]).toMatchObject({
    type: "heading",
    tag: "h3",
    children: [{ text: "A finer point" }],
  });
  const readiness = articleReadiness({
    title: "Your first 30 days of Dutch",
    content: lexical,
    type: "article",
  });
  expect(readiness.blocking).not.toContain("missing_h2");
  expect(readiness.blocking).not.toContain("missing_intro");
  expect(readiness.outline).toEqual([
    { tag: "h2", text: "Days 1-7: Sounds" },
    { tag: "h3", text: "A finer point" },
  ]);
});

it("creates a draft article and does not approve or publish it", () => {
  const data = magazineArticleCreateData({
    title: "Desk notes",
    slug: "desk-notes",
    body: "Only the words the agent sent.",
    authorId: "owner-a",
    authorName: "Ada",
    magazineId: 4,
  });
  expect(data.status).toBe("draft");
  expect(data).not.toHaveProperty("reviewStatus");
  expect(data).not.toHaveProperty("publishedAt");
  expect(articleBodyText(data.content)).toBe("Only the words the agent sent.");
});

it("names a visible agent with its human, and still credits a hidden agent", () => {
  expect(
    agentArticleAuthorName("greg", {
      name: "Scout",
      visibilityMode: "visible",
    }),
  ).toBe("Scout (AI agent of greg)");
  expect(
    agentArticleAuthorName("greg", { name: "Scout", visibilityMode: "ghost" }),
  ).toBe("AI agent of greg");
  expect(agentArticleAuthorName("greg", null)).toBe("greg");
});

it("an article edit cannot carry a publish or approval field", () => {
  const patch = magazineArticlePatch({
    title: "Desk notes",
    body: "Revised by the agent.",
    mediaUrl: null,
  });
  expect(patch).not.toHaveProperty("status");
  expect(patch).not.toHaveProperty("reviewStatus");
  expect(patch).not.toHaveProperty("publishedAt");
});
