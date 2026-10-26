/**
 * The serializable views of issue items (ADR-0043). Server item strategies
 * produce them; client renderers and the issue builder consume them. No
 * server imports here: client code imports this module.
 */

/** An original magazine article in an issue. */
export type ArticleItemView = {
  kind: "article";
  itemId: string;
  intro: string | null;
  article: {
    id: number;
    slug: string;
    title: string;
    authorName: string | null;
    excerpt: string;
    readingMinutes: number;
    imageUrl: string | null;
  };
};

/** Free-form text owned by the issue. */
export type EditorialItemView = {
  kind: "editorial";
  itemId: string;
  intro: string | null;
  heading: string | null;
  /** Lexical editor state, rendered like article content. */
  body: unknown;
};

/** An AIT News story, read live from its source. */
export type StorylineItemView = {
  kind: "storyline";
  itemId: string;
  intro: string | null;
  storyline: {
    slug: string;
    title: string;
    overview: string;
    sourceCount: number;
    updatedAt: string | null;
  };
};

/** What a reader sees for one issue item, by kind. */
export type IssueItemView =
  | ArticleItemView
  | EditorialItemView
  | StorylineItemView;

/** The item kinds; each has one strategy, one block and one renderer. */
export type ItemKindId = IssueItemView["kind"];

/**
 * An item whose content cannot be shown: the reference is gone, its content
 * is not ready for readers, or it belongs to another magazine. Readers never
 * get these (the item is skipped); editors get them in place, as markers.
 */
export type UnavailableItem = {
  kind: ItemKindId;
  itemId: string;
  unavailable: true;
  reason: "missing" | "not_ready" | "other_magazine" | "unpublished";
};

/** What an editor sees for one issue item. */
export type EditorItemView = IssueItemView | UnavailableItem;

/**
 * Why an issue item cannot be saved or published. `itemIndex` is the item's
 * position in the issue; `code` is the magazine refusal code the client maps
 * to friendly text.
 */
export type ItemProblem = {
  itemIndex: number;
  code: "ITEM_INVALID" | "ARTICLE_PLACED" | "ARTICLE_NOT_READY";
  detail?: string;
};
