"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  GALLERY_BATCH_TEXT_MAX,
  galleryMediaTypeOf,
} from "@/lib/gallery-rules";
import { canTranscode } from "@/lib/video-transcode";
import type { VideoVisibility } from "@/lib/video-rules";
import { api } from "@/trpc/react";

import {
  GalleryCategoryField,
  GalleryEventField,
  GalleryMagazineField,
  GalleryTextField,
  linkableEvent,
} from "./gallery-detail-fields";
import { acceptPickedFiles, type SelectionNotice } from "./gallery-selection";
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

  // A linked event is sent only once the choices show photos may be added
  // to it: until then Upload waits; if it is not among them, or the
  // choices cannot load, it is dropped with a line that says so.
  let eventId = form.eventId;
  let eventNote: string | null = null;
  if (form.eventId !== null && choices.isError) {
    eventId = null;
    eventNote = t("eventUnchecked");
  } else if (
    form.eventId !== null &&
    choices.data &&
    !linkableEvent(choices.data, form.eventId)
  ) {
    eventId = null;
    eventNote = t("eventUnavailable");
  }
  const checkingEvent = form.eventId !== null && choices.isPending;
  const event = linkableEvent(choices.data, eventId);
  // "Everyone" counts only where outsiders can see the community.
  const offerEveryone = choices.data?.publicReachesOutsiders === true;
  const visibility = offerEveryone ? form.visibility : "community";

  async function pick(picked: File[]) {
    // Only a video needs the converter, so only then is the browser asked.
    const hasVideo = picked.some(
      (file) => galleryMediaTypeOf(file.type) === "video",
    );
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
            // Accepted files are always a photo or a video.
            mediaType: galleryMediaTypeOf(file.type) ?? "photo",
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

  // A file dropped beside the drop zone must not make the browser leave
  // the page (and the upload) to show it.
  useEffect(() => {
    if (!open) return;
    const stay = (event: DragEvent) => event.preventDefault();
    window.addEventListener("dragover", stay);
    window.addEventListener("drop", stay);
    return () => {
      window.removeEventListener("dragover", stay);
      window.removeEventListener("drop", stay);
    };
  }, [open]);

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
                note={eventNote}
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
              <GalleryTextField
                label={t("text")}
                hint={t("textHint")}
                value={form.text}
                max={GALLERY_BATCH_TEXT_MAX}
                onChange={(text) => change({ text })}
              />
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
                disabled={form.files.length === 0 || checkingEvent}
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
                  canRetry={upload.retryable.length > 0}
                  failed={uploadOutcome(upload.state).failed}
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
 * main action; with nothing a retry could send, Done is. Leave out failed
 * files is offered beside them whenever a file failed.
 */
function FinishedActions({
  canRetry,
  failed,
  onRetry,
  onDrop,
  onDone,
}: {
  canRetry: boolean;
  failed: number;
  onRetry: () => void;
  onDrop: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("gallery.upload");
  return (
    <>
      <Button
        type="button"
        variant={canRetry ? "ghost" : "default"}
        onClick={onDone}
      >
        {t("done")}
      </Button>
      {failed > 0 ? (
        <Button type="button" variant="outline" onClick={onDrop}>
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
