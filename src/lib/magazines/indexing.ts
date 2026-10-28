import type { IssueStatus } from "./values";

/**
 * What search engines may see of a magazine (ADR-0042). Robots tags and
 * structured data on the reading pages use the resolver's outsider reach;
 * nothing here derives access from visibility (Decision 9).
 */

export type OutsiderReach = "none" | "teaser" | "full";

type IndexFacts = {
  status: IssueStatus;
  /** `IssueCard.outsiderReach`, computed by the resolver. */
  outsiderReach: OutsiderReach;
};

/** An issue the resolver lets outsiders reach, unless staff hid its magazine. */
export function isIssueIndexable(
  issue: IndexFacts,
  magazine: { staffHidden: boolean },
): boolean {
  return !magazine.staffHidden && issue.outsiderReach !== "none";
}

type ArticleFacts = { status: "draft" | "published" };

/**
 * A published article in a published issue: what readers can reach.
 * Anything else on the article page is an editor's preview.
 */
export function isMagazineArticleOut(
  issue: Pick<IndexFacts, "status">,
  article: ArticleFacts,
): boolean {
  return issue.status === "published" && article.status === "published";
}

/** An article that is out, in an issue anyone may read. */
export function isMagazineArticleIndexable(
  issue: IndexFacts,
  article: ArticleFacts,
  magazine: { staffHidden: boolean },
): boolean {
  return (
    isIssueIndexable(issue, magazine) && isMagazineArticleOut(issue, article)
  );
}

/** A magazine staff did not hide, with at least one indexable issue. */
export function isShelfIndexable(
  magazine: { staffHidden: boolean },
  issues: readonly IndexFacts[],
): boolean {
  return issues.some((issue) => isIssueIndexable(issue, magazine));
}
