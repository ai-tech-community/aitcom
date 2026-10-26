import { readEditorError } from "@/components/magazines/editor/editor-errors";
import type { EditorErrorKey } from "@/components/magazines/editor/editor-errors";
import {
  communityMagazinePath,
  magazineArticleEditPath,
} from "@/lib/magazines/paths";

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
    };

/** Message keys are under the editor's `articleEditor` namespace. */
export type DestinationBehaviour = {
  /** Extra fields for `articles.create`; the server fixes the channel there. */
  createExtras: { magazineId?: number };
  /** Where the writer goes once the article is handed in. */
  afterSubmitHref: string;
  /** The hand-in action, when it is not a trusted author's direct publish. */
  submitLabelKey: "submitForReview" | "magazine.markReady";
  /** Whether a trusted author publishes directly from the editor. */
  showTrustedPublish: boolean;
  /** The note shown once a non-trusted hand-in went through. */
  submittedKey: "submitted" | "magazine.markedReady";
  prePublishTitleKey: "prePublishTitle" | "magazine.prePublishTitle";
  prePublishSubtitleKey: "prePublishSubtitle" | "magazine.prePublishSubtitle";
  /** The locale-free address of a saved article in this editor. */
  editPath: (articleSlug: string) => string;
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
  submittedKey: "submitted",
  prePublishTitleKey: "prePublishTitle",
  prePublishSubtitleKey: "prePublishSubtitle",
  editPath: (articleSlug) => `/blog/edit/${articleSlug}`,
  errorKey: () => null,
};

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
      // Slice 1: editors write magazine articles, so marking one ready is
      // the approval; it goes live with the issue that holds it.
      return {
        createExtras: { magazineId: destination.magazineId },
        afterSubmitHref: communityMagazinePath(destination.communitySlug),
        submitLabelKey: "magazine.markReady",
        showTrustedPublish: false,
        submittedKey: "magazine.markedReady",
        prePublishTitleKey: "magazine.prePublishTitle",
        prePublishSubtitleKey: "magazine.prePublishSubtitle",
        editPath: (articleSlug) =>
          magazineArticleEditPath(destination.communitySlug, articleSlug),
        // The magazine services answer in codes; raw codes never reach a toast.
        errorKey: (error) => readEditorError(error).key,
      };
  }
}
