"use client";

import { useId, useRef, useState } from "react";
import { Globe, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { GALLERY_BATCH_TEXT_MAX } from "@/lib/gallery-rules";
import { canTranscode } from "@/lib/video-transcode";
import type { VideoVisibility } from "@/lib/video-rules";
import { api } from "@/trpc/react";

import {
  GalleryCategoryField,
  GalleryEventField,
  GalleryMagazineField,
  TextCounter,
  linkableEvent,
} from "./gallery-detail-fields";
import {
  acceptPickedFiles,
  pickedMediaType,
  type SelectionNotice,
} from "./gallery-selection";
import { GalleryUploadPicker, type ChosenFile } from "./gallery-upload-picker";
import {
  GalleryUploadProgress,
  uploadOutcome,
} from "./gallery-upload-progress";
import {
  useGalleryUpload,
  type GalleryBatchSettings,
} from "./use-gallery-upload";

type UploadForm = {
  files: ChosenFile[];
  notices: SelectionNotice[];
  eventId: number | null;
  topicSlug: string | null;
  visibility: VideoVisibility;
  text: string;
  magazineConsent: boolean;
};

/**
 * Adding photos and videos to a community's gallery in one dialog (spec
 * 2026-11-13, Upload dialog, variant A): choose files, say where they are
 * from and who may see them, then Upload N. Then each file's progress, and
 * at the end what was added and what to do about any file that was not.
 *
 * While files are being sent the dialog cannot be dismissed: Cancel stops
 * the run, which still finishes the batch with what is ready. Mounted fresh
 * for each opening (the page keys it), so every opening starts empty.
 */
export function GalleryUploadDialog({
  slug,
  open,
  onOpenChange,
  initialEventId,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** An event to start with (an event page's "Add yours"). */
  initialEventId?: number;
}) {
  const t = useTranslations("gallery.upload");
  const upload = useGalleryUpload(slug);
  const choices = api.gallery.uploadChoices.useQuery(
    { slug },
    { enabled: open },
  );
  const topics = api.topics.list.useQuery({ communitySlug: slug });
  const textId = useId();
  const nextId = useRef(0);
  const videoCheck = useRef<Promise<boolean> | null>(null);

  const [form, setForm] = useState<UploadForm>({
    files: [],
    notices: [],
    eventId: initialEventId ?? null,
    topicSlug: null,
    visibility: "community",
    text: "",
    magazineConsent: false,
  });
  const change = (patch: Partial<UploadForm>) =>
    setForm((current) => ({ ...current, ...patch }));

  const { phase } = upload.state;
  const running = phase === "running";

  // A linked event photos may no longer be added to is dropped once the
  // choices are known; "Everyone" counts only where outsiders can see it.
  const eventId =
    choices.data && !linkableEvent(choices.data, form.eventId)
      ? null
      : form.eventId;
  const event = linkableEvent(choices.data, eventId);
  const offerEveryone = choices.data?.publicReachesOutsiders === true;
  const visibility = offerEveryone ? form.visibility : "community";

  async function pick(picked: File[]) {
    // Only a video needs the converter, so only then is the browser asked.
    const hasVideo = picked.some((file) => pickedMediaType(file) === "video");
    let canConvertVideo = true;
    if (hasVideo) {
      videoCheck.current ??= canTranscode().catch(() => false);
      canConvertVideo = await videoCheck.current;
    }
    setForm((current) => {
      const { accepted, notices } = acceptPickedFiles(
        {
          files: current.files.length,
          videos: current.files.filter((file) => file.mediaType === "video")
            .length,
        },
        picked,
        { canConvertVideo },
      );
      return {
        ...current,
        notices,
        files: [
          ...current.files,
          ...accepted.map((file) => ({
            id: String(++nextId.current),
            file,
            mediaType: pickedMediaType(file) ?? "photo",
          })),
        ],
      };
    });
  }

  function submit() {
    if (form.files.length === 0) return;
    const text = form.text.trim();
    const settings: GalleryBatchSettings = {
      visibility,
      magazineConsent: form.magazineConsent,
      ...(eventId !== null && { eventId }),
      ...(form.topicSlug !== null && { topicSlug: form.topicSlug }),
      ...(text && { caption: text }),
    };
    void upload.start(
      form.files.map((chosen) => chosen.file),
      settings,
    );
  }

  const close = () => onOpenChange(false);
  const holdWhileRunning = (event: Event) => {
    if (running) event.preventDefault();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && running) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={!running}
        onEscapeKeyDown={holdWhileRunning}
        onInteractOutside={holdWhileRunning}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {event
              ? t("descriptionEvent", { event: event.title })
              : t("description")}
          </DialogDescription>
        </DialogHeader>

        {phase === "idle" ? (
          <>
            <GalleryUploadPicker
              files={form.files}
              notices={form.notices}
              onPick={(picked) => void pick(picked)}
              onRemove={(id) =>
                change({
                  files: form.files.filter((chosen) => chosen.id !== id),
                  notices: [],
                })
              }
            />
            <div className="grid gap-5">
              <GalleryEventField
                choices={choices}
                value={eventId}
                onChange={(next) => change({ eventId: next })}
              />
              <GalleryCategoryField
                topics={topics.data ?? []}
                value={form.topicSlug}
                onChange={(next) => change({ topicSlug: next })}
              />
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">{t("whoCanSee")}</span>
                {offerEveryone ? (
                  <SegmentedControl<VideoVisibility>
                    aria-label={t("whoCanSee")}
                    className="w-fit"
                    value={visibility}
                    onValueChange={(next) => change({ visibility: next })}
                    options={[
                      {
                        value: "community",
                        label: (
                          <>
                            <Lock aria-hidden="true" className="size-3.5" />
                            {t("members")}
                          </>
                        ),
                      },
                      {
                        value: "public",
                        label: (
                          <>
                            <Globe aria-hidden="true" className="size-3.5" />
                            {t("everyone")}
                          </>
                        ),
                      },
                    ]}
                  />
                ) : (
                  <p className="text-muted-foreground flex items-start gap-1.5 text-sm">
                    <Lock
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0"
                    />
                    {choices.data ? t("membersOnlyCommunity") : t("members")}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <label htmlFor={textId} className="text-sm font-medium">
                  {t("text")}
                </label>
                <Textarea
                  id={textId}
                  value={form.text}
                  maxLength={GALLERY_BATCH_TEXT_MAX}
                  onChange={(e) => change({ text: e.target.value })}
                  aria-describedby={`${textId}-hint ${textId}-count`}
                  rows={2}
                />
                <div className="flex items-start justify-between gap-3">
                  <p
                    id={`${textId}-hint`}
                    className="text-muted-foreground text-xs"
                  >
                    {t("textHint")}
                  </p>
                  <TextCounter
                    id={`${textId}-count`}
                    count={form.text.length}
                    max={GALLERY_BATCH_TEXT_MAX}
                  />
                </div>
              </div>
              <GalleryMagazineField
                label={t("magazine")}
                checked={form.magazineConsent}
                onChange={(next) => change({ magazineConsent: next })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>
                {t("cancel")}
              </Button>
              <Button
                type="button"
                disabled={form.files.length === 0}
                onClick={submit}
              >
                {t("upload", { count: form.files.length })}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <GalleryUploadProgress
              state={upload.state}
              place={event?.title ?? null}
            />
            <DialogFooter>
              {running ? (
                <Button type="button" variant="outline" onClick={upload.cancel}>
                  {t("cancel")}
                </Button>
              ) : (
                <FinishedActions
                  outcome={uploadOutcome(upload.state)}
                  onRetry={() => void upload.retryUnsent()}
                  onDrop={upload.dropFailed}
                  onDone={close}
                />
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * After a run: Try again (when some file could still go through) is the
 * main action, Leave out failed files beside it; with nothing left to send,
 * Done is.
 */
function FinishedActions({
  outcome,
  onRetry,
  onDrop,
  onDone,
}: {
  outcome: ReturnType<typeof uploadOutcome>;
  onRetry: () => void;
  onDrop: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("gallery.upload");
  const { canRetry } = outcome;
  return (
    <>
      <Button
        type="button"
        variant={canRetry || outcome.failed > 0 ? "ghost" : "default"}
        onClick={onDone}
      >
        {t("done")}
      </Button>
      {outcome.failed > 0 ? (
        <Button
          type="button"
          variant={canRetry ? "outline" : "default"}
          onClick={onDrop}
        >
          {t("drop")}
        </Button>
      ) : null}
      {canRetry ? (
        <Button type="button" onClick={onRetry}>
          {t("retry")}
        </Button>
      ) : null}
    </>
  );
}
