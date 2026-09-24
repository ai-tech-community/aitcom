"use client";

import { Film, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { VideoVisibility } from "@/lib/video-rules";
import type { VideoPostState } from "./use-video-post";

/** The picked clip in the composer: who can watch, progress, and errors. */
export function VideoAttachment({
  file,
  visibility,
  onVisibilityChange,
  onRemove,
  onCancel,
  onRetry,
  state,
}: {
  file: File;
  visibility: VideoVisibility;
  onVisibilityChange: (visibility: VideoVisibility) => void;
  onRemove: () => void;
  onCancel: () => void;
  /** Try the same post again (same caption and visibility). */
  onRetry: () => void;
  state: VideoPostState;
}) {
  const t = useTranslations("communities.video");
  const busy =
    state.step === "preparing" ||
    state.step === "uploading" ||
    state.step === "posting";
  const percent =
    state.step === "posting"
      ? 100
      : "share" in state
        ? Math.round(state.share * 100)
        : 0;
  const label =
    state.step === "preparing"
      ? t("preparing")
      : state.step === "uploading"
        ? t("uploading")
        : state.step === "posting"
          ? t("posting")
          : null;

  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm">
        <Film aria-hidden="true" className="text-muted-foreground size-4" />
        <span className="min-w-0 flex-1 truncate">{file.name}</span>
        {busy ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onRemove}
            aria-label={t("remove")}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">
          {t("visibilityLabel")}
        </span>
        <SegmentedControl<VideoVisibility>
          aria-label={t("visibilityLabel")}
          size="sm"
          className="h-auto min-h-7 max-w-full [&>label]:py-1 [&>label]:whitespace-normal"
          value={visibility}
          onValueChange={onVisibilityChange}
          options={[
            { value: "community", label: t("community"), disabled: busy },
            { value: "public", label: t("public"), disabled: busy },
          ]}
        />
      </div>

      {label ? (
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-muted-foreground text-xs" aria-hidden="true">
              {label}
            </span>
            {/* Radix gives the bar role="progressbar"; the shared Progress does not
                forward `value` to it, so aria-valuenow is set here. */}
            <Progress
              value={percent}
              aria-label={label}
              aria-valuenow={percent}
            />
          </div>
          {state.step === "posting" ? null : (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              {t("cancel")}
            </Button>
          )}
        </div>
      ) : null}

      {state.step === "error" ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-destructive min-w-0 flex-1 text-sm">
            {state.message}
          </p>
          {state.retryable ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
