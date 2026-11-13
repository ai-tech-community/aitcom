"use client";

import { useState } from "react";
import { Globe, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GALLERY_ALT_MAX, GALLERY_CAPTION_MAX } from "@/lib/gallery-rules";
import type { GalleryItemView } from "@/server/gallery/items";
import { api, type RouterInputs } from "@/trpc/react";

import {
  GalleryCategoryField,
  GalleryEventField,
  GalleryMagazineField,
  GalleryTextField,
} from "./gallery-detail-fields";
import { useGalleryErrorText } from "./gallery-error-text";

type ItemDetails = {
  caption: string;
  alt: string;
  topicSlug: string | null;
  eventId: number | null;
  magazineConsent: boolean;
};

export type GalleryItemChanges = Omit<
  RouterInputs["gallery"]["updateItem"],
  "slug" | "itemId"
>;

function detailsOf(item: GalleryItemView): ItemDetails {
  return {
    caption: item.caption ?? "",
    alt: item.alt ?? "",
    topicSlug: item.topicSlug,
    eventId: item.event?.id ?? null,
    magazineConsent: item.magazineConsent,
  };
}

/**
 * Only what the member changed, so an edit never rewrites a field it did
 * not touch (a kept event or category is not checked again). Text is
 * compared and sent trimmed; an emptied text clears it.
 */
export function galleryItemChanges(
  item: GalleryItemView,
  next: ItemDetails,
): GalleryItemChanges {
  const before = detailsOf(item);
  const changes: GalleryItemChanges = {};
  const caption = next.caption.trim();
  if (caption !== before.caption.trim()) changes.caption = caption;
  const alt = next.alt.trim();
  if (alt !== before.alt.trim()) changes.alt = alt;
  if (next.topicSlug !== before.topicSlug) changes.topicSlug = next.topicSlug;
  if (next.eventId !== before.eventId) changes.eventId = next.eventId;
  if (next.magazineConsent !== before.magazineConsent) {
    changes.magazineConsent = next.magazineConsent;
  }
  return changes;
}

/**
 * The uploader's Edit details for one item (spec 2026-11-13, Gallery tab):
 * caption, description, category, event and magazine permission. Who can
 * see it is shown, not offered: it is fixed at upload. Mounted fresh for
 * each item (the page keys it).
 */
export function GalleryEditDialog({
  slug,
  item,
  open,
  onOpenChange,
}: {
  slug: string;
  item: GalleryItemView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("gallery.edit");
  const errorText = useGalleryErrorText();
  const utils = api.useUtils();
  const choices = api.gallery.uploadChoices.useQuery(
    { slug },
    { enabled: open },
  );
  const topics = api.topics.list.useQuery({ communitySlug: slug });
  const [details, setDetails] = useState(() => detailsOf(item));
  const [failure, setFailure] = useState<string | null>(null);
  const change = (patch: Partial<ItemDetails>) =>
    setDetails((current) => ({ ...current, ...patch }));

  const update = api.gallery.updateItem.useMutation({
    onSuccess: () => {
      void utils.gallery.list.invalidate({ slug });
      void utils.gallery.facets.invalidate({ slug });
      void utils.gallery.item.invalidate({ slug, itemId: item.id });
      toast.success(t("saved"));
      onOpenChange(false);
    },
    onError: (error) => setFailure(errorText(error, "saveFailed")),
  });

  const changes = galleryItemChanges(item, details);
  const changed = Object.keys(changes).length > 0;
  const isPublic = item.visibility === "public";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!changed || update.isPending) return;
            setFailure(null);
            update.mutate({ slug, itemId: item.id, ...changes });
          }}
        >
          <GalleryTextField
            label={t("caption")}
            hint={t("captionHint")}
            value={details.caption}
            max={GALLERY_CAPTION_MAX}
            onChange={(caption) => change({ caption })}
          />
          <GalleryTextField
            label={t("alt")}
            hint={t("altHint")}
            value={details.alt}
            max={GALLERY_ALT_MAX}
            onChange={(alt) => change({ alt })}
          />
          <GalleryEventField
            choices={choices}
            value={details.eventId}
            current={item.event}
            onChange={(eventId) => change({ eventId })}
          />
          <GalleryCategoryField
            topics={topics.data ?? []}
            value={details.topicSlug}
            onChange={(topicSlug) => change({ topicSlug })}
          />
          <div className="grid gap-1">
            <span className="text-sm font-medium">{t("whoCanSee")}</span>
            <p className="flex items-center gap-1.5 text-sm">
              {isPublic ? (
                <Globe aria-hidden="true" className="size-3.5 shrink-0" />
              ) : (
                <Lock aria-hidden="true" className="size-3.5 shrink-0" />
              )}
              {isPublic ? t("everyone") : t("membersOnly")}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("visibilityFixed")}
            </p>
          </div>
          <GalleryMagazineField
            label={t("magazine")}
            checked={details.magazineConsent}
            onChange={(magazineConsent) => change({ magazineConsent })}
          />
          {failure ? (
            <p role="alert" className="text-destructive text-sm">
              {failure}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={!changed || update.isPending}>
              {update.isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
