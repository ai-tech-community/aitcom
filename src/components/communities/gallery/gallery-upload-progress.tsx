"use client";

import { Check, Film, Image as ImageIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import { useGalleryUploadErrorText } from "./gallery-error-text";
import type {
  GalleryUploadErrorCode,
  GalleryUploadFile,
  GalleryUploadState,
} from "./use-gallery-upload";

/**
 * Refusals that belong to the file itself: sending it again fails the same
 * way, so a retry is not offered for them, only leaving them out.
 */
const FILE_BOUND_CODES: ReadonlySet<GalleryUploadErrorCode> = new Set([
  "FILE_TOO_LARGE",
  "FILE_TYPE_NOT_ALLOWED",
  "UNDECODABLE_PHOTO",
  "VIDEO_TOO_LONG",
  "UNSUPPORTED_VIDEO",
  "CANNOT_CONVERT_VIDEO",
]);

/** What the finished run leaves the member to decide. */
export function uploadOutcome(state: GalleryUploadState) {
  const done = state.files.filter((file) => file.phase === "done");
  const failed = state.files.filter((file) => file.phase === "failed");
  const unsent = state.files.filter((file) => file.phase === "waiting");
  const hitLimit =
    state.error === "UPLOAD_LIMIT" ||
    failed.some((file) => file.error === "UPLOAD_LIMIT");
  return {
    photosAdded: done.filter((file) => file.mediaType === "photo").length,
    videosAdded: done.filter((file) => file.mediaType === "video").length,
    failed: failed.length,
    unsent: unsent.length,
    /** Some file could still go through if sent again. */
    canRetry:
      unsent.length > 0 ||
      failed.some((file) => !file.error || !FILE_BOUND_CODES.has(file.error)),
    hitLimit,
  };
}

/**
 * The upload dialog while sending and after: a refusal of the whole batch
 * first, then what was added, then one row per file with its progress (the
 * conversion's, for a video) or why it did not upload.
 */
export function GalleryUploadProgress({
  state,
  place,
}: {
  state: GalleryUploadState;
  /** Where the files go: the event's title, or null for the gallery. */
  place: string | null;
}) {
  const t = useTranslations("gallery.upload");
  const errorText = useGalleryUploadErrorText();
  const finished = state.phase === "finished";
  const outcome = uploadOutcome(state);
  const doneCount = outcome.photosAdded + outcome.videosAdded;

  const photos = t("photos", { count: outcome.photosAdded });
  const videos = t("videos", { count: outcome.videosAdded });
  const what =
    outcome.photosAdded > 0 && outcome.videosAdded > 0
      ? t("photosAndVideos", { photos, videos })
      : outcome.videosAdded > 0
        ? videos
        : photos;

  return (
    <div className="grid gap-3">
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {errorText(state.error)}
        </p>
      ) : null}

      {finished && doneCount > 0 ? (
        <p role="status" className="text-sm font-medium">
          {t("addedTo", { what, place: place ?? t("theGallery") })}
        </p>
      ) : null}
      {finished && outcome.failed > 0 ? (
        <p className="text-sm">{t("someFailed", { count: outcome.failed })}</p>
      ) : null}
      {finished && outcome.unsent > 0 ? (
        <p className="text-sm">{t("someNotSent", { count: outcome.unsent })}</p>
      ) : null}
      {finished && outcome.hitLimit ? (
        <p className="text-muted-foreground text-xs">{t("limitNote")}</p>
      ) : null}

      {finished ? null : (
        <p role="status" className="sr-only">
          {t("overall", { done: doneCount, total: state.files.length })}
        </p>
      )}

      <ul
        aria-label={t("progress")}
        className="divide-border max-h-80 divide-y overflow-y-auto rounded-lg border"
      >
        {state.files.map((file) => (
          <ProgressRow
            key={file.id}
            file={file}
            finished={finished}
            reason={
              file.phase === "failed"
                ? errorText(file.error ?? "UPLOAD_FAILED")
                : null
            }
          />
        ))}
      </ul>
    </div>
  );
}

function ProgressRow({
  file,
  finished,
  reason,
}: {
  file: GalleryUploadFile;
  finished: boolean;
  reason: string | null;
}) {
  const t = useTranslations("gallery.upload");
  const percent = Math.round(file.progress * 100);
  const Icon = file.mediaType === "video" ? Film : ImageIcon;
  // Shrinking a photo reports no share: its bar runs without a value.
  const measured = !(file.phase === "preparing" && file.mediaType === "photo");

  let status: string | null = null;
  switch (file.phase) {
    case "waiting":
      status = finished ? t("notSent") : t("waiting");
      break;
    case "preparing":
      status = measured ? t("converting", { percent }) : t("shrinking");
      break;
    case "uploading":
      status = t("uploading", { percent });
      break;
    case "done":
      status = t("added");
      break;
    case "failed":
      break;
  }
  const active = file.phase === "preparing" || file.phase === "uploading";

  return (
    <li className="grid gap-1.5 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <Icon aria-hidden="true" className="text-muted-foreground size-4" />
        <span className="min-w-0 flex-1 truncate">{file.name}</span>
        {status === null ? null : (
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 text-xs",
              file.phase === "done" ? "text-success" : "text-muted-foreground",
            )}
          >
            {file.phase === "done" ? (
              <Check aria-hidden="true" className="size-3.5" />
            ) : null}
            {status}
          </span>
        )}
      </div>
      {file.phase === "failed" ? (
        <p className="text-destructive flex items-start gap-1 text-xs">
          <X aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {reason}
        </p>
      ) : null}
      {active ? (
        <Progress
          value={measured ? percent : null}
          aria-label={`${file.name}: ${status}`}
          aria-valuenow={measured ? percent : undefined}
        />
      ) : null}
    </li>
  );
}
