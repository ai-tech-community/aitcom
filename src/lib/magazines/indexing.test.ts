import { describe, expect, it } from "vitest";

import {
  isIssueIndexable,
  isShelfIndexable,
  isMagazineArticleIndexable,
  isMagazineArticleOut,
} from "./indexing";

describe("magazine indexing", () => {
  it("indexes only a published issue that is effectively public", () => {
    expect(
      isIssueIndexable(
        { status: "published", effectiveVisibility: "public" },
        { staffHidden: false },
      ),
    ).toBe(true);
    expect(
      isIssueIndexable(
        { status: "published", effectiveVisibility: "members" },
        { staffHidden: false },
      ),
    ).toBe(false);
    expect(
      isIssueIndexable(
        { status: "draft", effectiveVisibility: "public" },
        { staffHidden: false },
      ),
    ).toBe(false);
  });

  it("indexes an article only when it and its issue are out and public", () => {
    const publicIssue = {
      status: "published",
      effectiveVisibility: "public",
    } as const;
    expect(
      isMagazineArticleIndexable(
        publicIssue,
        { status: "published" },
        { staffHidden: false },
      ),
    ).toBe(true);
    expect(
      isMagazineArticleIndexable(
        publicIssue,
        { status: "draft" },
        { staffHidden: false },
      ),
    ).toBe(false);
    expect(
      isMagazineArticleIndexable(
        { status: "published", effectiveVisibility: "members" },
        { status: "published" },
        { staffHidden: false },
      ),
    ).toBe(false);
  });

  it("a hidden magazine is never indexable", () => {
    const issue = {
      status: "published",
      effectiveVisibility: "public",
    } as const;
    const hidden = { staffHidden: true };
    expect(isIssueIndexable(issue, hidden)).toBe(false);
    expect(
      isMagazineArticleIndexable(issue, { status: "published" }, hidden),
    ).toBe(false);
    expect(isShelfIndexable(hidden, [issue])).toBe(false);
    expect(isShelfIndexable({ staffHidden: false }, [issue])).toBe(true);
    expect(isShelfIndexable({ staffHidden: false }, [])).toBe(false);
    expect(
      isShelfIndexable({ staffHidden: false }, [{ ...issue, status: "draft" }]),
    ).toBe(false);
    expect(
      isShelfIndexable({ staffHidden: false }, [
        { ...issue, effectiveVisibility: "members" },
      ]),
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
