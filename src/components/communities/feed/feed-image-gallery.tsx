"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type GalleryImage = {
  /** Sized for the feed. */
  url: string;
  /** The original, for the large view (defaults to `url`). */
  fullUrl?: string;
  alt: string;
  width?: number | null;
  height?: number | null;
};

/** Tile shapes per picture count: one tall picture beside two for three. */
const LAYOUT: Record<number, string> = {
  2: "grid-cols-2 aspect-[2/1]",
  3: "grid-cols-2 grid-rows-2 aspect-[4/3]",
  4: "grid-cols-2 grid-rows-2 aspect-[4/3]",
};

/** A single picture keeps its own shape between these (width / height). */
const MIN_RATIO = 4 / 5;
const MAX_RATIO = 2;
/** How far a finger must travel to move to the next picture. */
const SWIPE_PX = 50;

function ownRatio(image: GalleryImage): number {
  return image.width && image.height ? image.width / image.height : 4 / 3;
}

/**
 * A post's pictures: one shown whole (fitted, not cropped, when it is very
 * tall or wide), two to four in a tidy grid. Any picture opens a large view
 * of the original with its description, where arrow keys, swipes or the
 * buttons move between them, and screen readers hear each change.
 */
export function FeedImageGallery({ images }: { images: GalleryImage[] }) {
  const t = useTranslations("communities.feed");
  const [open, setOpen] = useState<number | null>(null);
  const touchStart = useRef<number | null>(null);
  if (images.length === 0) return null;
  const count = images.length;

  // An empty description falls back to the picture's place in the post.
  const name = (index: number) => {
    const alt = images[index]?.alt;
    if (alt) return alt;
    if (count === 1) return t("picture");
    return t("pictureOf", { number: index + 1, total: count });
  };

  const move = (step: number) =>
    setOpen((at) => (at === null ? at : (at + step + count) % count));

  const current = open === null ? null : images[open];
  const single = images[0]!;
  const singleOwn = ownRatio(single);
  const singleShown = Math.min(MAX_RATIO, Math.max(MIN_RATIO, singleOwn));

  return (
    <>
      {count === 1 ? (
        <button
          type="button"
          onClick={() => setOpen(0)}
          aria-label={t("openPicture", { name: name(0) })}
          className="focus-visible:ring-ring/50 bg-muted block w-full overflow-hidden rounded-lg outline-none focus-visible:ring-[3px]"
          style={{ aspectRatio: singleShown }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- S3 media */}
          <img
            src={single.url}
            alt={single.alt}
            width={single.width ?? undefined}
            height={single.height ?? undefined}
            loading="lazy"
            className={cn(
              "size-full",
              // Within the bounds the frame has the picture's own shape;
              // past them the picture is fitted inside, never cropped.
              singleShown === singleOwn ? "object-cover" : "object-contain",
            )}
          />
        </button>
      ) : (
        <ul
          aria-label={t("pictures", { count })}
          className={cn(
            "grid w-full gap-1 overflow-hidden rounded-lg",
            LAYOUT[Math.min(count, 4)],
          )}
        >
          {images.slice(0, 4).map((image, index) => (
            <li
              key={image.url}
              className={cn(
                "bg-muted min-h-0",
                count === 3 && index === 0 && "row-span-2",
              )}
            >
              <button
                type="button"
                onClick={() => setOpen(index)}
                aria-label={t("openPicture", { name: name(index) })}
                className="focus-visible:ring-ring/50 block size-full outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- S3 media */}
                <img
                  src={image.url}
                  alt={image.alt}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open !== null}
        onOpenChange={(next) => !next && setOpen(null)}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-[min(64rem,calc(100%-2rem))] gap-3 p-3 sm:max-w-[min(64rem,calc(100%-2rem))]"
          onKeyDown={(e) => {
            if (count < 2) return;
            if (e.key === "ArrowRight") move(1);
            if (e.key === "ArrowLeft") move(-1);
          }}
          onTouchStart={(e) => {
            touchStart.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStart.current;
            const end = e.changedTouches[0]?.clientX;
            touchStart.current = null;
            if (count < 2 || start === null || end === undefined) return;
            if (end - start <= -SWIPE_PX) move(1);
            else if (end - start >= SWIPE_PX) move(-1);
          }}
        >
          <DialogTitle className="sr-only">
            {open === null
              ? ""
              : count === 1
                ? t("picture")
                : t("pictureOf", { number: open + 1, total: count })}
          </DialogTitle>
          {current ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- S3 media */}
              <img
                src={current.fullUrl ?? current.url}
                // Described by the caption below, so it is not read twice.
                alt=""
                className="max-h-[75dvh] w-full rounded-md object-contain"
              />
              <div className="flex items-center gap-2">
                {/* Speaks the new picture's place and description. */}
                <div aria-live="polite" className="min-w-0 flex-1">
                  {count > 1 ? (
                    <span className="sr-only">
                      {t("pictureOf", { number: open! + 1, total: count })}
                    </span>
                  ) : null}
                  <DialogDescription className="text-sm">
                    {current.alt}
                  </DialogDescription>
                </div>
                {count > 1 ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="text-muted-foreground font-mono text-xs tabular-nums"
                    >
                      {open! + 1} / {count}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => move(-1)}
                      aria-label={t("previousPicture")}
                    >
                      <ChevronLeft aria-hidden="true" className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => move(1)}
                      aria-label={t("nextPicture")}
                    >
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </Button>
                  </>
                ) : null}
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("closePicture")}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </DialogClose>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
