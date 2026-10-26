import { describe, expect, it } from "vitest";

import {
  isIssueIndexable,
  isMagazineArticleIndexable,
  isMagazineArticleOut,
} from "./indexing";

describe("magazine indexing", () => {
  it("indexes only a published issue that is effectively public", () => {
    expect(
      isIssueIndexable({ status: "published", effectiveVisibility: "public" }),
    ).toBe(true);
    expect(
      isIssueIndexable({ status: "published", effectiveVisibility: "members" }),
    ).toBe(false);
    expect(
      isIssueIndexable({ status: "draft", effectiveVisibility: "public" }),
    ).toBe(false);
  });

  it("indexes an article only when it and its issue are out and public", () => {
    const publicIssue = {
      status: "published",
      effectiveVisibility: "public",
    } as const;
    expect(
      isMagazineArticleIndexable(publicIssue, { status: "published" }),
    ).toBe(true);
    expect(isMagazineArticleIndexable(publicIssue, { status: "draft" })).toBe(
      false,
    );
    expect(
      isMagazineArticleIndexable(
        { status: "published", effectiveVisibility: "members" },
        { status: "published" },
      ),
    ).toBe(false);
  });

  it("an article is out only when it and its issue are published", () => {
    expect(
      isMagazineArticleOut({ status: "published" }, { status: "published" }),
    ).toBe(true);
    // Published on its own, but its issue is not out yet.
    expect(
      isMagazineArticleOut({ status: "draft" }, { status: "published" }),
    ).toBe(false);
    expect(
      isMagazineArticleOut({ status: "published" }, { status: "draft" }),
    ).toBe(false);
  });
});
