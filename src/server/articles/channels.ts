/**
 * Publication channels for articles (ADR-0043, decision 6).
 *
 * Articles are one collection. Where an article is published — the blog or
 * a community magazine — changes how it is written and reviewed, not what
 * it is. This module is the only place that decides write behaviour from
 * the `magazine` relation: hooks and routers ask `channelFor(article)` and
 * dispatch on the channel's members, never on `magazine` directly. (Read
 * queries still name the field, because a Payload `where` needs it.)
 */

export type ArticleChannelId = "blog" | "magazine";

/**
 * How a member hands in an article.
 * - `staff_review`: it goes to the platform review queue; a trusted author
 *   publishes directly.
 * - `magazine_review`: the magazine module decides how the writer hands it
 *   in; publishing waits for an issue.
 */
export type ArticleSubmitPolicy = "staff_review" | "magazine_review";

/**
 * Who may edit or delete an article, before and after publication.
 * - `trusted_author`: today's blog rule; published edits require trust.
 * - `magazine`: the magazine module decides from the writer's capabilities
 *   and the article's latest state.
 */
export type ArticleEditPolicy = "trusted_author" | "magazine";

/**
 * When a reader may comment on an article. Commenting is a channel
 * decision, not the read rule: a magazine editor reads unpublished work,
 * but a preview has no readers, so it has no comment thread (ruling 60).
 * - `public_article`: the blog rule — published and public.
 * - `published_issue_reader`: published, and placed in a published issue
 *   the viewer may read. An editor previewing unpublished work may not.
 */
export type CommentPolicy = "public_article" | "published_issue_reader";

/** The article fields the channels read and write. */
export type ArticleData = {
  status?: string | null;
  publishedAt?: string | null;
  reviewStatus?: string | null;
  authorType?: string | null;
  magazine?: unknown;
};

export interface ArticleChannel {
  readonly id: ArticleChannelId;
  /**
   * beforeChange: adjust status/publishedAt for a review status change.
   * `data` is the whole article (Payload fills in what the update left out);
   * an update that does not change the review status changes nothing.
   * Mutates `data`.
   */
  onReviewChange(data: ArticleData, originalDoc: ArticleData | undefined): void;
  /**
   * beforeChange on a duplicate (a create copied from another article):
   * adjust what the copy must not inherit. Mutates `data`.
   */
  onDuplicate(data: ArticleData): void;
  /** afterChange: whether reaching `approved` publishes and credits now. */
  readonly creditsOnApproval: boolean;
  readonly submitPolicy: ArticleSubmitPolicy;
  /** The magazine module decides its own save and delete rules. */
  readonly editPolicy: ArticleEditPolicy;
  readonly commentPolicy: CommentPolicy;
}

function sendBackToDraftOnRefusal(
  data: ArticleData,
  originalDoc: ArticleData | undefined,
): void {
  if (
    (data.reviewStatus === "rejected" ||
      data.reviewStatus === "changes_requested") &&
    originalDoc?.reviewStatus !== data.reviewStatus
  ) {
    data.status = "draft";
    data.publishedAt = null;
  }
}

/** The blog: today's review behaviour, unchanged. */
export const blogChannel: ArticleChannel = {
  id: "blog",
  creditsOnApproval: true,
  submitPolicy: "staff_review",
  editPolicy: "trusted_author",
  commentPolicy: "public_article",
  onReviewChange(data, originalDoc) {
    if (
      data.reviewStatus === "approved" &&
      originalDoc?.reviewStatus !== "approved"
    ) {
      data.status = "published";
      data.publishedAt = data.publishedAt ?? new Date().toISOString();
    } else if (data.reviewStatus === "pending_review") {
      data.status = "draft";
      data.publishedAt = null;
    } else {
      sendBackToDraftOnRefusal(data, originalDoc);
    }
  },
  onDuplicate() {
    // Today's behaviour: a copy keeps what its source has.
  },
};

/**
 * A community magazine: approval means "ready for an issue". Status,
 * publish date, XP and badges wait until an issue that holds the article
 * is published (the issue service credits it then).
 */
export const magazineChannel: ArticleChannel = {
  id: "magazine",
  creditsOnApproval: false,
  submitPolicy: "magazine_review",
  editPolicy: "magazine",
  commentPolicy: "published_issue_reader",
  onReviewChange(data, originalDoc) {
    sendBackToDraftOnRefusal(data, originalDoc);
  },
  onDuplicate(data) {
    // Only an issue publishes a magazine article, and the copy has never
    // been in one: it starts unpublished (so it is not credited either).
    data.status = "draft";
    data.publishedAt = null;
  },
};

/** A relationship value as stored (id) or populated (`{ id }`), or null. */
function relationId(value: unknown): string | null {
  const id =
    typeof value === "object" && value !== null
      ? (value as { id?: unknown }).id
      : value;
  return typeof id === "number" || typeof id === "string" ? String(id) : null;
}

export function channelFor(article: { magazine?: unknown }): ArticleChannel {
  return relationId(article.magazine) === null ? blogChannel : magazineChannel;
}

/**
 * The refusal of a save that would move an article between channels. A
 * plain Error (it is thrown inside Payload's save, admin included); the
 * routers turn it into the magazine refusal code of the same name.
 */
export class ArticleMagazineLockedError extends Error {
  constructor() {
    super("ARTICLE_MAGAZINE_LOCKED");
    this.name = "ArticleMagazineLockedError";
  }
}

/** Whether an error is, or wraps, an `ArticleMagazineLockedError`. */
export function isArticleMagazineLocked(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (current instanceof ArticleMagazineLockedError) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * beforeChange guard: an article never moves into, out of, or between
 * magazines. Its channel is fixed when it is created. `data` is the whole
 * article as Payload hands it to the hook.
 */
export function assertMagazineUnchanged(
  data: ArticleData,
  originalDoc: ArticleData | undefined,
): void {
  if (!originalDoc) return;
  if (relationId(data.magazine) !== relationId(originalDoc.magazine)) {
    throw new ArticleMagazineLockedError();
  }
}
