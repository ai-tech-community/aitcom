/** Shown when the live issue is still unpublished and the agent's review is open. */
export const ISSUE_WAITING_MESSAGE =
  "This article is in an issue waiting for review. The owner or a magazine editor must approve or reject that review before the article can change.";

/** A published article is member-visible, so the agent's edit waits for approval. */
export const PUBLISHED_ARTICLE_UPDATE_MESSAGE =
  "This article is published. The change is saved as a draft until you or the community owner approves it.";

export const PUBLISHED_ARTICLE_READY_MESSAGE =
  "This article is already published. Save the change with save-magazine-article. That change waits for you or the community owner to approve it.";

export const NOT_OWN_ARTICLE_MESSAGE =
  "You can only edit your own article. Ask its author or a magazine editor to change it.";

export const ARTICLE_WITH_EDITOR_MESSAGE =
  "This article is with an editor. Wait until they approve it or request changes before editing it again.";

export const OPEN_DRAFT_MESSAGE =
  "You can only edit your own open article draft. If the article is published, save the change and it will wait for approval.";

export type IssueReviewHold =
  | { blocked: false }
  | { blocked: true; message: string };

/**
 * The lock follows the live issue, not the agent_draft row. A pending review
 * of an issue that is already published does not block the article.
 */
export function issueReviewHold(input: {
  pending: boolean;
  issueStatus: "draft" | "scheduled" | "published" | null;
}): IssueReviewHold {
  if (!input.pending) return { blocked: false };
  if (input.issueStatus === "draft" || input.issueStatus === "scheduled") {
    return { blocked: true, message: ISSUE_WAITING_MESSAGE };
  }
  return { blocked: false };
}

export function isStalePublishedIssueDraft(row: {
  type: string;
  draftStatus: string;
  issueStatus: string | null;
}): boolean {
  return (
    row.type === "magazine_issue" &&
    row.draftStatus === "pending" &&
    row.issueStatus === "published"
  );
}

/** `--write` applies. Every other invocation, including no flags, is a dry run. */
export function closeIssueDraftWrites(argv: readonly string[]): boolean {
  return argv.includes("--write");
}
