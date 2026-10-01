"use client";

import type { ReactNode } from "react";
import { Film, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The picture a post carries while it is being written or edited, with a
 * button to take it off. Nothing is removed until the post is saved, so
 * the button is neutral, not destructive. Without a `src` (a video whose
 * thumbnail is missing) a film placeholder stands in.
 */
export function MediaPreview({
  src,
  alt,
  badge,
  removeLabel,
  onRemove,
  disabled,
}: {
  src: string | null;
  /** Empty when `badge` already says what this is. */
  alt: string;
  /** A small label over the picture, e.g. "Current video". */
  badge?: ReactNode;
  removeLabel: string;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative inline-block">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- S3, signed or local blob URLs
        <img src={src} alt={alt} className="max-h-48 rounded-lg object-cover" />
      ) : (
        <div className="bg-muted text-muted-foreground flex size-32 items-center justify-center rounded-lg">
          <Film aria-hidden="true" className="size-8" />
        </div>
      )}
      {badge ? (
        <span className="bg-background/90 absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs">
          {badge}
        </span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="bg-background/90 absolute top-1 right-1 size-8"
        onClick={onRemove}
        disabled={disabled}
        aria-label={removeLabel}
      >
        <X aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}
