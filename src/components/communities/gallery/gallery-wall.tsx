"use client";

import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { GalleryItemView } from "@/server/gallery/items";

import { GalleryTile } from "./gallery-tile";

/**
 * CSS-columns masonry: two columns, three from `@xl`, four from `@4xl`, by
 * the wall's own width (the community rail takes 20rem from `lg`, so the
 * screen width says little about the room here — DESIGN.md community frame).
 */
const COLUMNS = "columns-2 gap-2.5 @xl:columns-3 @4xl:columns-4";

/**
 * The gallery wall. Lists are keyed by item id, never by URL: signed links
 * change every window, and a tile must stay the same element (and keep
 * focus) when they do.
 */
export function GalleryWall({
  items,
  showEvent,
  onOpen,
  className,
}: {
  items: readonly GalleryItemView[];
  showEvent: boolean;
  onOpen: (itemId: number) => void;
  className?: string;
}) {
  const t = useTranslations("gallery.wall");
  return (
    <div className={cn("@container", className)}>
      <ul aria-label={t("label")} className={COLUMNS}>
        {items.map((item) => (
          <li key={item.id} className="mb-2.5 break-inside-avoid">
            <GalleryTile item={item} showEvent={showEvent} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tile-shaped placeholders in the wall's own columns. */
const PLACEHOLDER_RATIOS = [4 / 3, 3 / 4, 1, 3 / 2, 4 / 5, 1, 3 / 2, 3 / 4];

export function GalleryWallSkeleton() {
  const t = useTranslations("gallery.wall");
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t("loading")}
      className="@container"
    >
      <div className={COLUMNS}>
        {PLACEHOLDER_RATIOS.map((ratio, index) => (
          <Skeleton
            key={index}
            className="mb-2.5 w-full rounded-lg"
            style={{ aspectRatio: ratio }}
          />
        ))}
      </div>
    </div>
  );
}
