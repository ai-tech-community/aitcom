// @vitest-environment node
import { describe, expect, it } from "vitest";

import { articleHref, readableArticleWhere } from "./article-access";
import { publicArticleWhere } from "./public-articles";

describe("readableArticleWhere", () => {
  it("readableArticleWhere with no readable issues is the blog rule only", () => {
    expect(readableArticleWhere([])).toEqual(publicArticleWhere());
  });

  it("adds placed, published magazine articles for readable issues", () => {
    expect(readableArticleWhere([7, 9])).toEqual({
      or: [
        publicArticleWhere(),
        {
          and: [
            { status: { equals: "published" } },
            { magazineIssue: { in: [7, 9] } },
          ],
        },
      ],
    });
  });
});

describe("articleHref", () => {
  const places = new Map([
    [7, { magazine: { slug: "agents-weekly" }, issue: { slug: "issue-3" } }],
  ]);

  it("links a blog article to the blog", () => {
    expect(
      articleHref(
        { slug: "hello", magazine: null, magazineIssue: null },
        places,
      ),
    ).toBe("/blog/hello");
  });

  it("links a placed magazine article under its issue", () => {
    expect(
      articleHref({ slug: "evals", magazine: 3, magazineIssue: 7 }, places),
    ).toBe("/magazines/agents-weekly/issue-3/evals");
  });

  it("has no link for a magazine article without a known placement", () => {
    expect(
      articleHref({ slug: "evals", magazine: 3, magazineIssue: null }, places),
    ).toBeNull();
    expect(
      articleHref({ slug: "evals", magazine: 3, magazineIssue: 8 }, places),
    ).toBeNull();
  });
});
