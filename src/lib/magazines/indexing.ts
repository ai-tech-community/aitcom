import type { IssueStatus, IssueVisibility } from "./values";

/**
 * What search engines may see of a magazine (ADR-0042). Robots tags and
 * structured data on the reading pages key off these, never off the stored
 * visibility: an unconfirmed public issue in an unlisted community is
 * members-only for everyone outside it (preflight F10).
 */

type IndexFacts = {
  status: IssueStatus;
  /** `IssueCard.effectiveVisibility`, not the stored value. */
  effectiveVisibility: IssueVisibility;
};

/** A published issue anyone may read. */
export function isIssueIndexable(
  issue: IndexFacts,
  magazine: { staffHidden: boolean },
): boolean {
  return (
    !magazine.staffHidden &&
    issue.status === "published" &&
    issue.effectiveVisibility === "public"
  );
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
