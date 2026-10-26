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
 * - `editor_approves`: the author is an editor of the magazine's community
 *   and marking it ready is the approval; publishing waits for an issue.
 */
export type ArticleSubmitPolicy = "staff_review" | "editor_approves";

/**
 * Who may still edit an article once it is published.
 * - `trusted_author`: its author, when trusted (today's blog rule).
 * - `magazine_editor`: its author, while an editor of the magazine's
 *   community (so a typo in a published issue can be fixed).
 */
export type PublishedEditPolicy = "trusted_author" | "magazine_editor";

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
   * Reads the review status from `data` only, so an update that does not
   * carry one changes nothing. Mutates `data`.
   */
  onReviewChange(data: ArticleData, originalDoc: ArticleData | undefined): void;
  /** afterChange: whether reaching `approved` publishes and credits now. */
  readonly creditsOnApproval: boolean;
  readonly submitPolicy: ArticleSubmitPolicy;
  readonly publishedEditPolicy: PublishedEditPolicy;
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
  publishedEditPolicy: "trusted_author",
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
};

/**
 * A community magazine: approval means "ready for an issue". Status,
 * publish date, XP and badges wait until an issue that holds the article
 * is published (the issue service credits it then).
 */
export const magazineChannel: ArticleChannel = {
  id: "magazine",
  creditsOnApproval: false,
  submitPolicy: "editor_approves",
  publishedEditPolicy: "magazine_editor",
  onReviewChange(data, originalDoc) {
    sendBackToDraftOnRefusal(data, originalDoc);
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
 * beforeChange guard: an article never moves into, out of, or between
 * magazines. Its channel is fixed when it is created. An update that does
 * not carry `magazine` keeps it.
 */
export function assertMagazineUnchanged(
  data: ArticleData,
  originalDoc: ArticleData | undefined,
): void {
  if (!originalDoc || !("magazine" in data)) return;
  if (relationId(data.magazine) !== relationId(originalDoc.magazine)) {
    throw new Error("ARTICLE_MAGAZINE_LOCKED");
  }
}
