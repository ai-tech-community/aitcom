"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import type { GalleryItemView } from "@/server/gallery/items";
import { api } from "@/trpc/react";

import { useGalleryErrorText } from "./gallery-error-text";
import { useGalleryReportReasonLabel } from "./gallery-report-text";

/**
 * Shown in the lightbox on a hidden (reported) item. Its uploader sees a
 * short note. The community's moderators (`canReview`) also see the open
 * reports — reason, note, when — and decide: **Restore** dismisses exactly
 * the reports shown here (their ids, so a report that came in since stays
 * open) and shows the item again; **Remove**, after a confirmation, deletes
 * it and its reports. Restore waits until the reports are shown, and the
 * reports are read again after a restore: one that came in meanwhile has
 * hidden the item again, and is shown for the next decision.
 *
 * Text stays `text-foreground` on the soft warning tint, as on a reported
 * feed post: the warning colour is carried by the border and the icon
 * (Pair-With-A-Cue).
 */
export function GalleryReviewBanner({
  slug,
  item,
  canReview,
  onRestored,
  onRemoved,
}: {
  slug: string;
  item: Pick<GalleryItemView, "id" | "mediaType">;
  canReview: boolean;
  onRestored: () => void;
  /** Called after a removal went through; the item is gone. */
  onRemoved: () => void;
}) {
  const t = useTranslations("gallery.review");
  const reasonLabel = useGalleryReportReasonLabel();
  const errorText = useGalleryErrorText();
  const confirm = useConfirm();
  const utils = api.useUtils();
  const reports = api.gallery.itemReports.useQuery(
    { slug, itemId: item.id },
    { enabled: canReview },
  );
  const review = api.gallery.reviewItemReports.useMutation({
    onSuccess: (_data, input) => {
      if (input.action === "restore") {
        toast.success(t("restored"));
        void utils.gallery.itemReports.invalidate({ slug, itemId: item.id });
        onRestored();
      } else {
        toast.success(t("removed"));
        onRemoved();
      }
    },
    onError: (error) => toast.error(errorText(error, "reviewFailed")),
  });

  const shown = canReview ? (reports.data?.reports ?? []) : [];
  // Restore names what is on screen, so not while it is being re-read.
  const canRestore =
    !review.isPending && !reports.isFetching && shown.length > 0;

  const askToRemove = async () => {
    const ok = await confirm({
      title:
        item.mediaType === "video"
          ? t("removeVideoTitle")
          : t("removePhotoTitle"),
      description: t("removeBody"),
      confirmLabel: t("remove"),
      destructive: true,
    });
    if (ok) review.mutate({ slug, itemId: item.id, action: "remove" });
  };

  return (
    <div className="border-warning/40 bg-warning/10 text-foreground flex flex-col gap-2 rounded-md border px-3 py-2 text-sm">
      <div className="flex items-start gap-2">
        <ShieldAlert
          aria-hidden="true"
          className="text-warning mt-0.5 size-4 shrink-0"
        />
        <p className={canReview ? "font-medium" : undefined}>
          {canReview ? t("hiddenForModerator") : t("hiddenForUploader")}
        </p>
      </div>

      {canReview && reports.isError ? (
        <p className="pl-6">
          {errorText(reports.error, "reportsLoadFailed")}{" "}
          <Button
            type="button"
            // Not `link`: that is Signal Orange, and this is no main action.
            variant="outline"
            size="xs"
            onClick={() => void reports.refetch()}
          >
            {t("retry")}
          </Button>
        </p>
      ) : null}

      {shown.length > 0 ? (
        <ul aria-label={t("reasons")} className="flex flex-col gap-1 pl-6">
          {shown.map((report) => (
            <li key={report.id} className="flex flex-col gap-0.5">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">
                  {reasonLabel(report.reason)}
                </span>
                <RelativeTime
                  date={report.createdAt}
                  className="text-muted-foreground font-mono text-xs"
                />
              </span>
              {report.note ? (
                <span className="min-w-0 break-words">{report.note}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {canReview ? (
        <div className="flex flex-wrap gap-2 pl-6">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canRestore}
            onClick={() =>
              review.mutate({
                slug,
                itemId: item.id,
                action: "restore",
                reviewedReportIds: shown.map((report) => report.id),
              })
            }
          >
            {t("restore")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={review.isPending}
            onClick={() => void askToRemove()}
          >
            {t("remove")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
