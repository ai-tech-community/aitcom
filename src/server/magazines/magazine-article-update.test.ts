import { expect, it } from "vitest";

import { magazineArticleUpdateFromDraft } from "./magazine-article-update";

it("reads the published-article change stored on the draft", () => {
  expect(
    magazineArticleUpdateFromDraft({
      metadata: {
        articleId: 58,
        title: "Dag 1",
        body: "Sam eats breakfast.",
        coverImageUrl: null,
      },
    }),
  ).toEqual({
    articleId: 58,
    title: "Dag 1",
    body: "Sam eats breakfast.",
    coverImageUrl: null,
  });
});
