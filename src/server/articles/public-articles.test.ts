// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isPublicArticle, publicArticleWhere } from "./public-articles";

describe("public article rule", () => {
  it("requires published, and approval for a member's article", () => {
    expect(publicArticleWhere()).toEqual({
      and: [
        { status: { equals: "published" } },
        {
          or: [
            { authorType: { not_equals: "member" } },
            { reviewStatus: { equals: "approved" } },
          ],
        },
      ],
    });
  });

  it.each([
    [{ status: "published", authorType: "admin" }, true],
    [
      { status: "published", authorType: "member", reviewStatus: "approved" },
      true,
    ],
    [
      {
        status: "published",
        authorType: "member",
        reviewStatus: "pending_review",
      },
      false,
    ],
    [{ status: "published", authorType: "member", reviewStatus: null }, false],
    [{ status: "draft", authorType: "admin" }, false],
    [
      { status: "draft", authorType: "member", reviewStatus: "approved" },
      false,
    ],
  ])("isPublicArticle(%o) is %s", (article, expected) => {
    expect(isPublicArticle(article)).toBe(expected);
  });
});
