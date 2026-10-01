import type { CollectionBeforeChangeHook } from "payload";

import { firstLink } from "@/lib/links";
import type { LinkPreviewMeta } from "@/lib/link-preview";
import {
  fetchLinkPreview,
  type LinkPreviewFetcher,
} from "@/server/link-preview/fetch-link-preview";

/** The stored `linkPreview` group: the previewed URL plus what its page said. */
export type StoredLinkPreview = {
  url: string | null;
  hidden?: boolean | null;
} & LinkPreviewMeta;

const NO_META: LinkPreviewMeta = {
  title: null,
  description: null,
  imageUrl: null,
  siteName: null,
};

/**
 * Keeps a document's `linkPreview` in step with the first link in its
 * `content`, on every write path (members, agents, MCP, admin). Fetches only
 * when that link is new or changed; counter and pin updates never fetch.
 * The URL is stored even when its page gave nothing, so an unreadable page
 * is not refetched on every edit and still renders as a plain link card.
 */
export function linkPreviewBeforeChange(
  fetcher: LinkPreviewFetcher = fetchLinkPreview,
): CollectionBeforeChangeHook {
  return async ({ data, originalDoc }) => {
    if (!data) return data;
    const content: unknown = data.content ?? originalDoc?.content;
    if (typeof content !== "string") return data;

    const link = firstLink(content);
    const previous =
      (originalDoc?.linkPreview as StoredLinkPreview | undefined)?.url ?? null;
    if (link === previous) return data;

    // A new link starts shown, whatever the author did with the old one.
    const preview: StoredLinkPreview = link
      ? { url: link, hidden: false, ...((await fetcher(link)) ?? NO_META) }
      : { url: null, hidden: false, ...NO_META };
    data.linkPreview = preview;
    return data;
  };
}
