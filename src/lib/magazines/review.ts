export const REVIEW_DECISIONS = [
  "approve",
  "request_changes",
  "reject",
] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
export const REVIEW_NOTE_MAX = 2000;

const REVIEW_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  reject: "rejected",
} as const;

export function reviewStatusFor(
  decision: ReviewDecision,
): "approved" | "changes_requested" | "rejected" {
  return REVIEW_STATUS[decision];
}

type ArticleState = { status?: string | null; reviewStatus?: string | null };

/** A contributor may still change or send in the article. */
export function isOpenForWriter(article: ArticleState): boolean {
  return (
    article.status !== "published" &&
    (article.reviewStatus == null ||
      article.reviewStatus === "changes_requested")
  );
}

/** Shared rule for the edit page, update/submit/delete and desk links. */
export function mayWriterChange(
  canEdit: boolean,
  article: ArticleState,
): boolean {
  return canEdit || isOpenForWriter(article);
}

/** Writer desk states, extended from editor-desk.tsx with approved. */
export const WRITER_REVIEW_STATUSES = [
  "pending_review",
  "changes_requested",
  "rejected",
  "approved",
] as const;
export type WriterStatus = (typeof WRITER_REVIEW_STATUSES)[number] | "draft";

export function writerStatusOf(reviewStatus: string | null): WriterStatus {
  return (WRITER_REVIEW_STATUSES as readonly string[]).includes(
    reviewStatus ?? "",
  )
    ? (reviewStatus as WriterStatus)
    : "draft";
}
