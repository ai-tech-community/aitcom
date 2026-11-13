"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { galleryItemLabel } from "@/lib/gallery-rules";
import type { CommunityTopic } from "@/payload-types";
import type { GalleryItemView } from "@/server/gallery/items";

/**
 * An item's accessible name (caption, else alt, else "Photo from {event} by
 * {name}"), translated. One rule for the tile, the lightbox and every later
 * place that shows an item.
 */
export function useGalleryItemLabel(): (item: GalleryItemView) => string {
  // Root-level: `galleryItemLabel` returns fully qualified keys.
  const t = useTranslations();
  return useCallback(
    (item) => {
      const label = galleryItemLabel({
        caption: item.caption,
        alt: item.alt,
        mediaType: item.mediaType,
        eventTitle: item.event?.title,
        uploaderName: item.uploader.name,
      });
      return "text" in label ? label.text : t(label.key, label.values);
    },
    [t],
  );
}

/** A clip's length as `m:ss` (gallery clips are at most 90 seconds). */
export function formatClipLength(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

/** A community topic as the topics list gives it. */
export type GalleryTopic = Pick<CommunityTopic, "slug" | "label" | "emoji">;

/**
 * A category's label with its emoji; the slug itself for a topic the
 * community no longer lists (or while the list loads).
 */
export function topicText(
  slug: string,
  topics: readonly GalleryTopic[],
): string {
  const topic = topics.find((each) => each.slug === slug);
  if (!topic) return slug;
  return topic.emoji ? `${topic.emoji} ${topic.label}` : topic.label;
}
