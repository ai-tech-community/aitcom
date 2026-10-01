"use client";

import { useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The most pictures one post carries (mirrors the server's limit). */
export const MAX_PICTURES = 4;
/** The longest description of one picture (mirrors the server's limit). */
export const MAX_PICTURE_ALT = 500;

export type PictureItem = {
  /** Stable across edits, for React and for focus. */
  key: string;
  src: string;
  alt: string;
  /** Still uploading: shown, but not yet sendable. */
  uploading?: boolean;
};

/**
 * The pictures a post being written carries: up to four thumbnails, each
 * with a description field (alt text, read out to people who cannot see
 * the picture) and a remove button. Nothing is sent until the post is.
 */
export function PictureAttachments({
  items,
  onAltChange,
  onRemove,
  disabled,
}: {
  items: PictureItem[];
  onAltChange: (key: string, alt: string) => void;
  onRemove: (key: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("communities.feed.editor");
  if (items.length === 0) return null;

  return (
    <ul
      aria-label={t("pictures")}
      className={cn(
        "grid gap-2",
        items.length === 1 ? "grid-cols-1 sm:max-w-xs" : "grid-cols-2",
      )}
    >
      {items.map((item, index) => (
        <li key={item.key} className="space-y-1.5">
          <div className="bg-muted relative aspect-[4/3] overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element -- S3 or local blob URLs */}
            <img
              src={item.src}
              alt=""
              className={cn(
                "size-full object-cover",
                item.uploading && "opacity-60",
              )}
            />
            {item.uploading ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <Loader2
                  aria-label={t("pictureUploading")}
                  className="size-5 animate-spin"
                />
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="bg-background/90 absolute top-1 right-1 size-8"
              onClick={() => onRemove(item.key)}
              disabled={disabled}
              aria-label={t("removePicture", { number: index + 1 })}
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
          <input
            type="text"
            value={item.alt}
            onChange={(e) => onAltChange(item.key, e.target.value)}
            maxLength={MAX_PICTURE_ALT}
            placeholder={t("describePicture")}
            aria-label={t("describePictureLabel", { number: index + 1 })}
            disabled={disabled}
            className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:ring-[3px]"
          />
        </li>
      ))}
    </ul>
  );
}
