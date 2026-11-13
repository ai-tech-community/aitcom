"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  ReportForm,
  type ReportDraft,
} from "@/components/moderation/report-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GALLERY_REPORT_NOTE_MAX,
  GALLERY_REPORT_REASONS,
  type GalleryReportReason,
} from "@/lib/gallery-report-reasons";
import type { GalleryItemView } from "@/server/gallery/items";
import { api } from "@/trpc/react";

import { useGalleryErrorText } from "./gallery-error-text";
import { useGalleryReportReasonLabel } from "./gallery-report-text";

/** "This is me" first: it is the reason a gallery has that a feed has not. */
const REASONS: readonly GalleryReportReason[] = [
  "this_is_me",
  ...GALLERY_REPORT_REASONS.filter((reason) => reason !== "this_is_me"),
];

/**
 * Lets someone report a gallery item: a reason (none chosen at first, so
 * "This is me" is never sent by accident) and an optional note. The first
 * report hides the item from everyone but its uploader and the moderators.
 *
 * After the report went through, the dialog stays open with a thank-you in
 * its status line and a Done button. Only when it then closes does it call
 * `onReported`: for most reporters the item is gone from what they may see,
 * and the caller closes the lightbox and refreshes the lists then, not
 * under this dialog. A failure is said in words in an alert line.
 */
export function GalleryReportDialog({
  slug,
  item,
  open,
  onOpenChange,
  onReported,
}: {
  slug: string;
  item: Pick<GalleryItemView, "id" | "mediaType">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReported: () => void;
}) {
  const t = useTranslations("gallery.report");
  const form = useTranslations("communities.report");
  const reasonLabel = useGalleryReportReasonLabel();
  const errorText = useGalleryErrorText();
  const [draft, setDraft] = useState<ReportDraft<GalleryReportReason>>({
    reason: null,
    note: "",
  });
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  const report = api.gallery.reportItem.useMutation({
    onSuccess: () => setSent(true),
    onError: (error) => setFailure(errorText(error, "reportFailed")),
  });

  // The form, with the focused button, is gone: focus goes to Done.
  useEffect(() => {
    if (sent) doneRef.current?.focus();
  }, [sent]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && sent) onReported();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {item.mediaType === "video" ? t("videoTitle") : t("photoTitle")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {/* Always there, so the thank-you is announced when it appears. */}
        <p role="status" className={sent ? "text-sm" : "sr-only"}>
          {sent ? t("sent") : null}
        </p>
        {sent ? (
          <DialogFooter>
            <DialogClose asChild>
              <Button ref={doneRef} type="button" variant="outline">
                {t("done")}
              </Button>
            </DialogClose>
          </DialogFooter>
        ) : (
          <ReportForm
            name={`gallery-report-${item.id}`}
            reasons={REASONS}
            reasonLabel={reasonLabel}
            draft={draft}
            onDraftChange={setDraft}
            noteMax={GALLERY_REPORT_NOTE_MAX}
            labels={{
              reasons: form("reasonLabel"),
              note: form("noteLabel"),
              submit: form("submit"),
            }}
            pending={report.isPending}
            onSubmit={(input) => {
              setFailure(null);
              report.mutate({ slug, itemId: item.id, ...input });
            }}
          >
            {failure ? (
              <p role="alert" className="text-destructive text-sm">
                {failure}
              </p>
            ) : null}
          </ReportForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
