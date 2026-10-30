import { describe, expect, it } from "vitest";

import {
  type OutsiderReach,
  isIssueIndexable,
  isShelfIndexable,
  isMagazineArticleIndexable,
  isMagazineArticleOut,
} from "./indexing";

describe("magazine indexing", () => {
  it.each<[OutsiderReach, boolean]>([
    ["none", false],
    ["teaser", true],
    ["full", true],
  ])(
    "indexes resolver reach %s iff it reaches outsiders and staff did not hide it",
    (outsiderReach, expected) => {
      const issue = { status: "published" as const, outsiderReach };
      expect(isIssueIndexable(issue, { staffHidden: false })).toBe(expected);
      expect(isIssueIndexable(issue, { staffHidden: true })).toBe(false);
      expect(isShelfIndexable({ staffHidden: false }, [issue])).toBe(expected);
      expect(
        isMagazineArticleIndexable(
          issue,
          { status: "published" },
          { staffHidden: false },
        ),
      ).toBe(expected);
      expect(
        isMagazineArticleIndexable(
          issue,
          { status: "draft" },
          { staffHidden: false },
        ),
      ).toBe(false);
    },
  );

  it("indexes an article only when it and its issue are out and public", () => {
    const publicIssue = {
      status: "published",
      outsiderReach: "full",
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
        { status: "published", outsiderReach: "none" },
        { status: "published" },
        { staffHidden: false },
      ),
    ).toBe(false);
  });

  it("a hidden magazine is never indexable", () => {
    const issue = {
      status: "published",
      outsiderReach: "full",
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
      isShelfIndexable({ staffHidden: false }, [
        { ...issue, status: "draft", outsiderReach: "none" },
      ]),
    ).toBe(false);
    expect(
      isShelfIndexable({ staffHidden: false }, [
        { ...issue, outsiderReach: "none" },
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
