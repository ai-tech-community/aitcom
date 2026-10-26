/**
 * Who may read a magazine issue, as values every layer shares (ADR-0042).
 * The server resolves it (`resolveMagazineIssueAccess`); item strategies,
 * read models and the reading components act on it. Client-safe.
 *
 * - none   — may not know the issue exists (callers answer NOT_FOUND)
 * - full   — may read the published issue
 * - editor — a magazine editor: sees drafts, unavailable-item markers and
 *            the latest draft text
 *
 * Slice 6 adds `teaser` here and to `ISSUE_VISIBILITIES` in the same change.
 * Every surface decides per access level with an exhaustive `switch` (or a
 * `Record` over the union), never with `access === "editor"`: a boolean lets
 * a new level pass through silently, a switch makes the compiler name each
 * surface that must decide what the new level shows.
 */
export type MagazineIssueAccess = "none" | "full" | "editor";

/** What a reader may do with an issue that answers (never `none`). */
export type IssueReaderAccess = Exclude<MagazineIssueAccess, "none">;

/** Which text of a magazine article a reader gets. */
export type ArticleTextMode = "published" | "latest_draft";

/**
 * The article text an access level reads: readers the published document,
 * editors the latest draft (what the author last saved).
 */
export function articleTextModeFor(access: IssueReaderAccess): ArticleTextMode {
  switch (access) {
    case "full":
      return "published";
    case "editor":
      return "latest_draft";
  }
}

/**
 * Whether an access level sees the editor's layer of an issue: draft
 * notices, edit links and markers for items readers cannot see.
 */
export function seesEditorLayer(access: IssueReaderAccess): boolean {
  switch (access) {
    case "full":
      return false;
    case "editor":
      return true;
  }
}
