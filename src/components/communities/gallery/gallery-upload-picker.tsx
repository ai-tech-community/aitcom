"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  GALLERY_MAX_FILES_PER_BATCH,
  GALLERY_MAX_VIDEOS_PER_BATCH,
  type GalleryMediaType,
} from "@/lib/gallery-rules";
import { cn } from "@/lib/utils";
import { MAX_VIDEO_SECONDS } from "@/lib/video-rules";

import type { SelectionNotice } from "./gallery-selection";

/** A file the member chose, before anything is sent. */
export type ChosenFile = {
  id: string;
  file: File;
  mediaType: GalleryMediaType;
};

/**
 * The upload dialog's drop zone: "Choose files" (any keyboard or screen
 * reader user's way in), drag and drop for the rest, the chosen files as
 * removable thumbnails, and a line for each kind of file left out.
 */
export function GalleryUploadPicker({
  files,
  notices,
  onPick,
  onRemove,
}: {
  files: readonly ChosenFile[];
  notices: readonly SelectionNotice[];
  onPick: (picked: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("gallery.upload");
  const video = useTranslations("communities.video");
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const noticeText: Record<SelectionNotice, string> = {
    notMedia: t("notMedia"),
    videosUnsupported: video("unsupported"),
    tooManyVideos: t("tooManyVideos", { max: GALLERY_MAX_VIDEOS_PER_BATCH }),
    tooManyFiles: t("tooManyFiles", { max: GALLERY_MAX_FILES_PER_BATCH }),
  };

  return (
    <div className="grid gap-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onPick(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "bg-muted/40 grid justify-items-center gap-3 rounded-lg border border-dashed p-5 text-center transition-colors",
          dragging ? "border-foreground" : "border-border",
        )}
      >
        {files.length === 0 ? (
          <>
            <ImagePlus
              aria-hidden="true"
              className="text-muted-foreground size-7"
            />
            <div className="grid gap-1">
              <p className="text-sm font-medium">{t("dropTitle")}</p>
              <p className="text-muted-foreground text-xs">
                {t("dropHint", { seconds: MAX_VIDEO_SECONDS })}
              </p>
            </div>
          </>
        ) : (
          <ul
            aria-label={t("chosen")}
            className="flex flex-wrap justify-center gap-2"
          >
            {files.map((chosen) => (
              <li key={chosen.id}>
                <ChosenThumb
                  chosen={chosen}
                  removeLabel={t("remove", { name: chosen.file.name })}
                  videoLabel={t("video")}
                  onRemove={() => onRemove(chosen.id)}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => input.current?.click()}
          >
            {files.length === 0 ? t("choose") : t("addMore")}
          </Button>
          {files.length > 0 ? (
            <span className="text-muted-foreground font-mono text-xs uppercase">
              {t("selected", { count: files.length })}
            </span>
          ) : null}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            // The same file may be picked again after removing it.
            event.target.value = "";
            if (picked.length > 0) onPick(picked);
          }}
        />
      </div>
      {/* Always mounted, so a refusal is announced when it appears. */}
      <div role="status" className="grid gap-1">
        {notices.map((notice) => (
          <p key={notice} className="text-sm">
            {noticeText[notice]}
          </p>
        ))}
      </div>
    </div>
  );
}

/** One chosen file: a preview from its local copy, and a remove button. */
function ChosenThumb({
  chosen,
  removeLabel,
  videoLabel,
  onRemove,
}: {
  chosen: ChosenFile;
  removeLabel: string;
  videoLabel: string;
  onRemove: () => void;
}) {
  const preview = useObjectUrl(chosen.file);
  return (
    <div className="bg-secondary relative size-18 overflow-hidden rounded-md">
      {preview === null ? null : chosen.mediaType === "video" ? (
        <video
          src={preview}
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          className="size-full object-cover"
        />
      ) : (
        // A local preview: nothing for next/image to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="size-full object-cover" />
      )}
      {chosen.mediaType === "video" ? (
        <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 font-mono text-[10px] text-white uppercase">
          {videoLabel}
        </span>
      ) : null}
      <Button
        type="button"
        size="icon-xs"
        aria-label={removeLabel}
        onClick={onRemove}
        className="absolute top-1 right-1 rounded-full bg-black/60 text-white hover:bg-black/80 hover:text-white"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

/** A local URL for the file while it is shown, released afterwards. */
function useObjectUrl(file: File): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}
