"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { LoadMoreQuery } from "@/components/ui/load-more";
import { Link } from "@/i18n/navigation";
import { isModeratorRole } from "@/lib/communities/moderator-roles";
import { cn } from "@/lib/utils";
import type { FeedGalleryView } from "@/server/gallery/feed-view";
import type { GalleryItemView } from "@/server/gallery/items";
import { api } from "@/trpc/react";

import { GalleryCategoryBadge } from "./gallery-category-badge";
import { GalleryTile } from "./gallery-tile";
import { useGalleryLightboxHost } from "./use-gallery-lightbox-host";

/**
 * Everything the lightbox moves through: the collage's items, then the rest
 * of the batch, page by page, starting after the collage's last item (the
 * feed and `gallery.list` both go newest first). Nothing is fetched until
 * Next goes past the collage; from then on the pages are kept fresh like
 * any list, so an edit or delete elsewhere shows here too.
 */
function useBatchItems(slug: string, gallery: FeedGalleryView) {
  const [started, setStarted] = useState(false);
  const rest = api.gallery.list.useInfiniteQuery(
    { slug, batchId: gallery.batchId },
    {
      initialCursor: gallery.items.at(-1)?.id,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      enabled: started,
    },
  );
  const pages = rest.data?.pages;

  const items = useMemo(() => {
    const seen = new Set<number>();
    // A refetched feed can move a paged item into the collage: show it once.
    return [
      ...gallery.items,
      ...(pages ?? []).flatMap((page) => page.items),
    ].filter((item) => !seen.has(item.id) && seen.add(item.id));
  }, [gallery.items, pages]);

  const more: LoadMoreQuery | undefined =
    gallery.total > gallery.items.length
      ? {
          // Before the first page, the feed's count says there is more.
          hasNextPage: pages ? rest.hasNextPage : true,
          isFetchingNextPage: rest.isFetchingNextPage,
          isFetchNextPageError: rest.isFetchNextPageError,
          fetchNextPage: () => {
            setStarted(true);
            return rest.fetchNextPage();
          },
        }
      : undefined;

  return { items, more };
}

/**
 * A gallery batch inside its feed post (spec 2026-11-13, Feed post
 * (collage); mockup variant A): the event as a link chip and the category
 * badge, then the first item large and up to two small beside it, with
 * "+N" on the third when the batch has more. Each tile opens the gallery
 * lightbox over the whole batch. The items are only those this viewer may
 * see; the server picked them.
 *
 * Edit and delete follow the Gallery tab: the uploader (while a member)
 * may edit their item, moderators may delete any. `onChange` reloads the
 * post after either, since the collage's items come with the feed.
 */
export function GalleryCollage({
  slug,
  gallery,
  memberRole,
  onChange,
}: {
  slug: string;
  gallery: FeedGalleryView;
  /** The viewer's role in the community; none for a non-member. */
  memberRole?: string | null;
  onChange?: () => void;
}) {
  const t = useTranslations("gallery.collage");
  const { items, more } = useBatchItems(slug, gallery);
  const scope = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const { open, host } = useGalleryLightboxHost({
    slug,
    items,
    scope,
    deletedFocus: group,
    isMember: !!memberRole,
    canModerate: isModeratorRole(memberRole),
    onChange,
    more,
  });

  const [first, second, third] = gallery.items;
  if (!first) return null;
  const extra = gallery.total - gallery.items.length;
  const tile = (item: GalleryItemView, className: string) => (
    <GalleryTile
      item={item}
      // Every item of a batch is from the batch's event, shown above.
      showEvent={false}
      onOpen={open}
      fill
      // Only the collage's outer corners are rounded.
      className={cn("rounded-none", className)}
    />
  );

  return (
    <div ref={scope} className="grid gap-2">
      {gallery.event || gallery.topicSlug ? (
        <div className="flex flex-wrap items-center gap-2">
          {gallery.event ? (
            <Badge asChild variant="outline" className="min-h-6 max-w-full">
              <Link href={`/events/${gallery.event.slug}`}>
                <CalendarDays aria-hidden="true" />
                <span className="truncate">{gallery.event.title}</span>
              </Link>
            </Badge>
          ) : null}
          {gallery.topicSlug ? (
            <GalleryCategoryBadge slug={slug} topicSlug={gallery.topicSlug} />
          ) : null}
        </div>
      ) : null}

      <div
        ref={group}
        role="group"
        aria-label={t("label", { count: gallery.total })}
        // Focus lands here when the item it would go back to was deleted.
        tabIndex={-1}
        className="focus-visible:ring-ring/50 grid aspect-[3/2] grid-cols-[2fr_1fr] gap-1 rounded-lg outline-none focus-visible:ring-[3px]"
      >
        {second
          ? tile(first, "rounded-l-lg")
          : tile(first, "col-span-2 rounded-lg")}
        {second ? (
          <div
            className={cn(
              "grid min-h-0 gap-1",
              third ? "grid-rows-2" : "grid-rows-1",
            )}
          >
            {tile(second, third ? "rounded-tr-lg" : "rounded-r-lg")}
            {third ? (
              <div className="relative min-h-0">
                {tile(third, "rounded-br-lg")}
                {extra > 0 ? (
                  // The group's name says the total; this is the picture.
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 grid place-items-center rounded-br-lg bg-black/55 font-mono text-xl font-semibold text-white"
                  >
                    +{extra}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {host}
    </div>
  );
}
