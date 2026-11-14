import { getTranslations } from "next-intl/server";

import type { AppLocale } from "@/i18n/messages";
import { galleryItemLabel, type GalleryItemLabel } from "@/lib/gallery-rules";
import type { GalleryItem } from "@/payload-types";
import { loadEventRefs, loadUploaders } from "@/server/gallery/items";
import { relationId } from "@/server/gallery/relation-id";

import type { Deps } from "../../deps";

/** Who added an item and what it shows, as an issue or the picker names it. */
export type GalleryItemCredit = {
  /**
   * The uploader's name, in the issue's language when there is none to show:
   * "Deleted member" once they are gone, "Member" when their account has no
   * name.
   */
  uploaderName: string;
  event: { title: string; slug: string } | null;
  /** The accessible name, for the client to translate. */
  label: GalleryItemLabel;
  /** The same name, translated here. */
  title: string;
};

type CreditedItem = Pick<
  GalleryItem,
  "id" | "uploaderId" | "event" | "caption" | "alt" | "mediaType"
>;

/**
 * Credits for items the caller may already show: uploaders and events are
 * read once for the whole list, never per item.
 */
export async function loadGalleryItemCredits(
  deps: Pick<Deps, "db" | "payload">,
  items: readonly CreditedItem[],
  locale: AppLocale,
): Promise<Map<number, GalleryItemCredit>> {
  if (items.length === 0) return new Map();
  const [uploaders, events, t] = await Promise.all([
    loadUploaders(
      deps,
      items.map((item) => item.uploaderId),
    ),
    loadEventRefs(
      deps,
      items.map((item) => relationId(item.event)).filter((id) => id !== null),
    ),
    getTranslations({ locale }),
  ]);
  return new Map(
    items.map((item) => {
      const uploader = uploaders.get(item.uploaderId);
      const uploaderName = uploader
        ? (uploader.name ?? t("gallery.unnamedMember"))
        : t("gallery.deletedMember");
      const eventId = relationId(item.event);
      const ref = eventId === null ? undefined : events.get(eventId);
      const event = ref ? { title: ref.title, slug: ref.slug } : null;
      const label = galleryItemLabel({
        caption: item.caption,
        alt: item.alt,
        mediaType: item.mediaType,
        eventTitle: event?.title,
        uploaderName,
      });
      const title = "text" in label ? label.text : t(label.key, label.values);
      return [item.id, { uploaderName, event, label, title }];
    }),
  );
}
