import type { ComponentType } from "react";
import { useTranslations } from "next-intl";

import type {
  EditorItemView,
  ItemKindId,
  UnavailableItem,
} from "@/lib/magazines/item-views";

import { StorylineItem, storylineItemTitle } from "./storyline-item";
import {
  LaunchpadProjectItem,
  launchpadProjectItemTitle,
} from "./launchpad-project-item";
import { ForumThreadItem, forumThreadItemTitle } from "./forum-thread-item";
import { EventItem, eventItemTitle } from "./event-item";
import { NewsItemCard, newsItemTitle } from "./news-item";
import { ArticleItem, articleItemTitle } from "./article-item";
import { EditorialItem, editorialItemTitle } from "./editorial-item";
import { ItemImageFigure } from "./item-image";
import type {
  ArticleHref,
  ItemRendererProps,
  ItemSize,
  ItemTitle,
  ItemTeaser,
  ItemViewOfKind,
} from "./types";

export type { ArticleHref, ItemRendererProps, ItemSize } from "./types";

/**
 * One renderer per item kind (ADR-0043), the client twin of the server's
 * `ITEM_KINDS`. A kind without a renderer is a type error; nothing here
 * switches on the kind.
 */
export const ITEM_RENDERERS: {
  [K in ItemKindId]: ComponentType<ItemRendererProps<K>>;
} = {
  article: ArticleItem,
  editorial: EditorialItem,
  storyline: StorylineItem,
  newsItem: NewsItemCard,
  event: EventItem,
  forumThread: ForumThreadItem,
  launchpadProject: LaunchpadProjectItem,
};

/** Each kind's title for the issue's contents list. */
const ITEM_TITLES: { [K in ItemKindId]: ItemTitle<K> } = {
  article: articleItemTitle,
  editorial: editorialItemTitle,
  storyline: storylineItemTitle,
  newsItem: newsItemTitle,
  event: eventItemTitle,
  forumThread: forumThreadItemTitle,
  launchpadProject: launchpadProjectItemTitle,
};

export function isUnavailableItem(
  view: EditorItemView,
): view is UnavailableItem {
  return "unavailable" in view;
}

function renderKind<K extends ItemKindId>(
  view: ItemViewOfKind<K>,
  size: ItemSize,
  href: ArticleHref,
  teaser: ItemTeaser | null,
  suppressSourceImage = false,
) {
  const Renderer: ComponentType<ItemRendererProps<K>> =
    ITEM_RENDERERS[view.kind];
  return (
    <Renderer
      view={view}
      size={size}
      href={href}
      teaser={teaser}
      suppressSourceImage={suppressSourceImage}
    />
  );
}

/**
 * The item's title as the contents list shows it: the kind's own title,
 * or null when the item has none or is unavailable (callers fall back to
 * their own words).
 */
export function itemTitle(view: EditorItemView): string | null {
  return isUnavailableItem(view) ? null : titleOfKind(view);
}

function titleOfKind<K extends ItemKindId>(
  view: ItemViewOfKind<K>,
): string | null {
  const title: ItemTitle<K> = ITEM_TITLES[view.kind];
  return title(view);
}

/** Editors only: what stands in for an item whose content cannot be shown. */
function UnavailableMarker({ reason }: { reason: UnavailableItem["reason"] }) {
  const t = useTranslations("magazines.item");
  return (
    <div
      role="note"
      className="text-muted-foreground flex h-full flex-col gap-1 rounded-xl border border-dashed p-5 text-sm"
    >
      <p className="text-foreground font-medium">{t("unavailable")}</p>
      <p>{t(`unavailableReason.${reason}`)}</p>
      <p className="text-xs">{t("editorsOnly")}</p>
    </div>
  );
}

/**
 * One issue item: its kind's renderer, or the editor-only "No longer
 * available" marker (readers never receive unavailable items).
 */
export function IssueItem({
  view,
  size,
  href,
  teaser,
}: {
  view: EditorItemView;
  size: ItemSize;
  href: ArticleHref;
  teaser: ItemTeaser | null;
}) {
  if (isUnavailableItem(view))
    return <UnavailableMarker reason={view.reason} />;
  if (!view.image) return renderKind(view, size, href, teaser);
  return (
    <div
      className={
        size === "row"
          ? "issue-item-image flex min-w-0 items-start gap-4 py-4"
          : "issue-item-image flex h-full min-w-0 flex-col"
      }
    >
      <ItemImageFigure image={view.image} compact={size === "row"} />
      <div
        className={
          size === "row"
            ? "min-w-0 flex-1 [&>[data-item-kind]]:py-0"
            : "min-w-0 flex-1"
        }
      >
        {renderKind(view, size, href, teaser, true)}
      </div>
    </div>
  );
}
