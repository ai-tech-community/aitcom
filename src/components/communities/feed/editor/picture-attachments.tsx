"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RotateCw, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** The most pictures one post carries (mirrors the server's limit). */
export const MAX_PICTURES = 4;
/** The longest description of one picture (mirrors the server's limit). */
export const MAX_PICTURE_ALT = 500;
/** The description's counter appears once this few characters are left. */
const ALT_COUNTER_FROM = 50;

export type PictureItem = {
  /** Stable across edits, for React and for focus. */
  key: string;
  src: string;
  alt: string;
  /** Still uploading: shown, but not yet sendable. */
  uploading?: boolean;
  /** Did not upload, and why. */
  failed?: "tooLarge" | "failed";
};

/**
 * The pictures a post being written carries: up to four thumbnails, each
 * with a description (alt text, read out to people who cannot see the
 * picture) and a remove button; a picture that did not upload says why and
 * can be tried again. After a removal, keyboard focus moves to the next
 * picture's remove button (or the previous one, or `onEmptied`).
 */
export function PictureAttachments({
  items,
  onAltChange,
  onRemove,
  onRetry,
  onEmptied,
  disabled,
}: {
  items: PictureItem[];
  onAltChange: (key: string, alt: string) => void;
  onRemove: (key: string) => void;
  onRetry?: (key: string) => void;
  /** The last picture went: move focus somewhere sensible. */
  onEmptied?: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("communities.feed.editor");
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusNext = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const target = focusNext.current;
    if (target === undefined) return;
    focusNext.current = undefined;
    if (target === null) onEmptied?.();
    else removeButtons.current.get(target)?.focus();
  }, [items, onEmptied]);

  const uploading = items.filter((item) => item.uploading).length;
  if (items.length === 0) return null;

  const remove = (index: number) => {
    const next = items[index + 1] ?? items[index - 1] ?? null;
    focusNext.current = next?.key ?? null;
    onRemove(items[index]!.key);
  };

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">{t("describeHelp")}</p>
      {/* Says how many pictures are still on their way (WCAG 4.1.3). */}
      <p role="status" className="sr-only">
        {uploading > 0 ? t("picturesUploading", { count: uploading }) : ""}
      </p>
      <ul
        aria-label={t("pictures")}
        className={cn(
          "grid gap-3",
          items.length === 1 ? "grid-cols-1 sm:max-w-xs" : "grid-cols-2",
        )}
      >
        {items.map((item, index) => {
          const altId = `picture-alt-${item.key}`;
          const left = MAX_PICTURE_ALT - item.alt.length;
          return (
            <li key={item.key} className="min-w-0 space-y-1.5">
              <div className="bg-muted relative aspect-[4/3] overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element -- S3 or local blob URLs */}
                <img
                  src={item.src}
                  alt=""
                  className={cn(
                    "size-full object-cover",
                    (item.uploading === true || item.failed !== undefined) &&
                      "opacity-50",
                  )}
                />
                {item.uploading ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Loader2
                      aria-hidden="true"
                      className="size-5 animate-spin"
                    />
                  </span>
                ) : null}
                {item.failed ? (
                  <div className="bg-background/90 absolute inset-x-1 bottom-1 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
                    <TriangleAlert
                      aria-hidden="true"
                      className="text-destructive size-3.5 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      {item.failed === "tooLarge"
                        ? t("pictureTooLarge")
                        : t("pictureFailed")}
                    </span>
                    {onRetry && item.failed === "failed" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onRetry(item.key)}
                        aria-label={t("retryPicture", { number: index + 1 })}
                      >
                        <RotateCw aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                <Button
                  ref={(el) => {
                    if (el) removeButtons.current.set(item.key, el);
                    else removeButtons.current.delete(item.key);
                  }}
                  type="button"
                  variant="outline"
                  size="icon"
                  className="bg-background/90 absolute top-1 right-1 size-8"
                  onClick={() => remove(index)}
                  disabled={disabled}
                  aria-label={t("removePicture", { number: index + 1 })}
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </div>
              <label
                htmlFor={altId}
                className="text-muted-foreground block text-xs"
              >
                {t("describePictureLabel", { number: index + 1 })}
              </label>
              <Input
                id={altId}
                value={item.alt}
                onChange={(e) => onAltChange(item.key, e.target.value)}
                maxLength={MAX_PICTURE_ALT}
                placeholder={t("describePicture")}
                disabled={disabled}
                className="h-8"
              />
              {left <= ALT_COUNTER_FROM ? (
                <p className="text-muted-foreground text-right font-mono text-xs tabular-nums">
                  {t("charactersLeft", { count: left })}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
