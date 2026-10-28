import { readEditorError } from "@/components/magazines/editor/editor-errors";
import type { EditorErrorKey } from "@/components/magazines/editor/editor-errors";
import {
  communityMagazinePath,
  magazineArticleEditPath,
} from "@/lib/magazines/paths";
import type { MagazineHandIn } from "@/lib/magazines/roles";

/**
 * Where an article is written for (ADR-0043 channels, seen from the
 * editor): the blog, or one community magazine. The editor is the same;
 * only what `destinationBehaviour` answers differs.
 */
export type ArticleDestination =
  | { kind: "blog" }
  | {
      kind: "magazine";
      magazineId: number;
      magazineName: string;
      communitySlug: string;
      handIn: MagazineHandIn;
    };

/** Message keys are under the editor's `articleEditor` namespace. */
export type DestinationBehaviour = {
  /** Extra fields for `articles.create`; the server fixes the channel there. */
  createExtras: { magazineId?: number };
  /** Where the writer goes once the article is handed in. */
  afterSubmitHref: string;
  /** The hand-in action, when it is not a trusted author's direct publish. */
  submitLabelKey:
    | "submitForReview"
    | "magazine.markReady"
    | "magazine.sendForReview";
  /** Whether a trusted author publishes directly from the editor. */
  showTrustedPublish: boolean;
  /** Keep the editors' note visible after a draft save clears the review state. */
  keepReviewNoteWhileWriting: boolean;
  /** The note shown once a non-trusted hand-in went through. */
  submittedKey: "submitted" | "magazine.markedReady" | "magazine.sentForReview";
  prePublishTitleKey:
    | "prePublishTitle"
    | "magazine.prePublishTitle"
    | "magazine.reviewPrePublishTitle";
  prePublishSubtitleKey:
    | "prePublishSubtitle"
    | "magazine.prePublishSubtitle"
    | "magazine.reviewPrePublishSubtitle";
  /** The locale-free address of a saved article in this editor. */
  editPath: (articleSlug: string) => string;
  /** Community whose issue picker should refresh after a magazine hand-in. */
  communitySlug: string | null;
  /**
   * A failed call as a key under `magazineEditor.errors`, or null to show
   * the server's own text (the blog router answers in words).
   */
  errorKey: (error: unknown) => EditorErrorKey | null;
};

const BLOG: DestinationBehaviour = {
  createExtras: {},
  afterSubmitHref: "/blog/my-articles",
  submitLabelKey: "submitForReview",
  showTrustedPublish: true,
  keepReviewNoteWhileWriting: false,
  submittedKey: "submitted",
  prePublishTitleKey: "prePublishTitle",
  prePublishSubtitleKey: "prePublishSubtitle",
  editPath: (articleSlug) => `/blog/edit/${articleSlug}`,
  communitySlug: null,
  errorKey: () => null,
};

/** The magazine decides how this writer hands in an article. */
function magazineHandInBehaviour(
  handIn: MagazineHandIn,
): Pick<
  DestinationBehaviour,
  | "submitLabelKey"
  | "submittedKey"
  | "prePublishTitleKey"
  | "prePublishSubtitleKey"
> {
  switch (handIn) {
    case "mark_ready":
      return {
        submitLabelKey: "magazine.markReady",
        submittedKey: "magazine.markedReady",
        prePublishTitleKey: "magazine.prePublishTitle",
        prePublishSubtitleKey: "magazine.prePublishSubtitle",
      };
    case "send_for_review":
      return {
        submitLabelKey: "magazine.sendForReview",
        submittedKey: "magazine.sentForReview",
        prePublishTitleKey: "magazine.reviewPrePublishTitle",
        prePublishSubtitleKey: "magazine.reviewPrePublishSubtitle",
      };
    default: {
      const unreachable: never = handIn;
      return unreachable;
    }
  }
}

/**
 * Everything the editor does differently per destination, in one place:
 * the editor itself never branches on `destination.kind`.
 */
export function destinationBehaviour(
  destination: ArticleDestination,
): DestinationBehaviour {
  switch (destination.kind) {
    case "blog":
      return BLOG;
    case "magazine":
      return {
        createExtras: { magazineId: destination.magazineId },
        afterSubmitHref: communityMagazinePath(destination.communitySlug),
        ...magazineHandInBehaviour(destination.handIn),
        showTrustedPublish: false,
        keepReviewNoteWhileWriting: true,
        editPath: (articleSlug) =>
          magazineArticleEditPath(destination.communitySlug, articleSlug),
        communitySlug: destination.communitySlug,
        // The magazine services answer in codes; raw codes never reach a toast.
        errorKey: (error) => readEditorError(error).key,
      };
    default: {
      const unreachable: never = destination;
      return unreachable;
    }
  }
}
