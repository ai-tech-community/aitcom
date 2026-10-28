import { expect, it } from "vitest";
import {
  articleBodyText,
  articleBodyToLexical,
  magazineArticleCreateData,
  magazineArticlePatch,
} from "./agent-article-body";

it("keeps the agent's words and line breaks without adding copy", () => {
  const body = "First line\n\nThird line stays";
  expect(articleBodyText(articleBodyToLexical(body))).toBe(body);
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
