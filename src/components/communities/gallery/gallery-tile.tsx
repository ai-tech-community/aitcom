"use client";

import { useId, type CSSProperties } from "react";
import Image from "next/image";
import { EyeOff, Play } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { GalleryItemView } from "@/server/gallery/items";

import { formatClipLength, useGalleryItemLabel } from "./gallery-item-text";

/**
 * Tiles keep the item's shape, within limits: a panorama or a long
 * screenshot is cropped instead of turning into a sliver or a tower.
 */
const MIN_RATIO = 1 / 2;
const MAX_RATIO = 2;

function tileRatio(item: Pick<GalleryItemView, "width" | "height">): number {
  const ratio = item.width / item.height;
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

/**
 * One photo or video on a wall: a button that opens it. Its accessible name
 * is the item's label; a video's badge (play glyph plus length, so the kind
 * is never told by colour) is its description. The caption shows on hover
 * and keyboard focus. A hidden (reported) item — only its uploader and the
 * moderators get those — carries a "Hidden" badge, in words, also part of
 * the description. `data-gallery-item-id` lets the lightbox hand focus
 * back to the tile of the item it showed last.
 *
 * On a wall the tile takes the item's shape; with `fill` it has no shape of
 * its own and fills the room its parent gives it (a feed post's collage).
 */
export function GalleryTile({
  item,
  showEvent,
  onOpen,
  fill = false,
  className,
}: {
  item: GalleryItemView;
  /** Off where every tile is from the same event (an event filter or page). */
  showEvent: boolean;
  onOpen: (itemId: number) => void;
  /** Fill the parent's box instead of keeping the item's shape. */
  fill?: boolean;
  className?: string;
}) {
  const t = useTranslations("gallery.tile");
  const labelFor = useGalleryItemLabel();
  const badgeId = useId();
  const hiddenId = useId();
  const isVideo = item.mediaType === "video";
  const length =
    isVideo && item.durationSeconds !== null
      ? formatClipLength(item.durationSeconds)
      : null;
  const caption = item.caption?.trim();
  const describedBy = [isVideo && badgeId, item.hidden && hiddenId]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      data-gallery-item-id={item.id}
      aria-label={labelFor(item)}
      aria-describedby={describedBy || undefined}
      onClick={() => onOpen(item.id)}
      style={
        fill
          ? undefined
          : ({ "--tile-ratio": tileRatio(item) } as CSSProperties)
      }
      className={cn(
        "group/tile bg-muted relative block w-full cursor-zoom-in overflow-hidden rounded-lg outline-none",
        fill ? "h-full" : "aspect-[var(--tile-ratio)]",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        className,
      )}
    >
      {/* Signed links change every window: never through the optimizer. */}
      <Image
        src={item.thumbnailUrl}
        alt=""
        fill
        unoptimized
        sizes="(min-width: 1024px) 25vw, 50vw"
        className="object-cover"
      />
      {isVideo ? (
        <span
          id={badgeId}
          className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 py-0.5 pr-2 pl-1.5 font-mono text-xs text-white"
        >
          <Play aria-hidden="true" className="size-2.5 fill-current" />
          <span className="sr-only">
            {length ? t("video", { duration: length }) : t("videoNoLength")}
          </span>
          <span aria-hidden="true">{length}</span>
        </span>
      ) : null}
      {item.hidden ? (
        <span
          id={hiddenId}
          className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 py-0.5 pr-2 pl-1.5 text-xs text-white"
        >
          <EyeOff aria-hidden="true" className="size-3" />
          {t("hidden")}
        </span>
      ) : null}
      {showEvent && item.event ? (
        <span
          className={cn(
            "absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-black/60 px-2 py-0.5 text-xs text-white",
            caption &&
              "group-hover/tile:opacity-0 group-focus-visible/tile:opacity-0 motion-safe:transition-opacity",
          )}
        >
          {item.event.title}
        </span>
      ) : null}
      {caption ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 line-clamp-3 bg-gradient-to-t from-black/70 to-transparent px-2.5 pt-6 pb-2 text-left text-sm text-white opacity-0 group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100 motion-safe:transition-opacity"
        >
          {caption}
        </span>
      ) : null}
    </button>
  );
}
