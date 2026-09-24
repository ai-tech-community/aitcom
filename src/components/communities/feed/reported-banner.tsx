"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { api } from "@/trpc/react";

/**
 * Shown on a hidden (reported) post. The author sees a short note. The
 * community's moderators also see why members reported it and can Restore or
 * Remove the post.
 *
 * Text stays `text-foreground` on the soft warning tint: `text-warning` on its
 * own 10–15% tint drops under 4.5:1, so the warning colour is carried by the
 * border and the icon instead (Pair-With-A-Cue).
 */
export function ReportedBanner({
  postId,
  canReview,
}: {
  postId: number;
  canReview: boolean;
}) {
  const t = useTranslations("communities.report");
  const confirm = useConfirm();
  const utils = api.useUtils();
  const reports = api.feed.getPostReports.useQuery(
    { postId },
    { enabled: canReview },
  );
  const review = api.feed.reviewReport.useMutation({
    onSuccess: () => {
      void utils.feed.getActivity.invalidate();
      void utils.feed.getFeed.invalidate();
      void utils.feed.getReels.invalidate();
    },
    onError: () => toast.error(t("failed")),
  });

  const openReports = canReview ? (reports.data ?? []) : [];

  return (
    <div className="border-warning/40 bg-warning/10 text-foreground flex flex-col gap-2 rounded-md border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldAlert
          aria-hidden="true"
          className="text-warning size-4 shrink-0"
        />
        <span className="min-w-0 flex-1">
          {canReview ? t("hiddenForModerator") : t("hiddenForAuthor")}
        </span>
        {canReview ? (
          <span className="flex gap-2">
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={review.isPending}
              onClick={() => review.mutate({ postId, action: "restore" })}
            >
              {t("restore")}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="destructive"
              disabled={review.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    description: t("removeConfirm"),
                    confirmLabel: t("remove"),
                    destructive: true,
                  })
                ) {
                  review.mutate({ postId, action: "remove" });
                }
              }}
            >
              {t("remove")}
            </Button>
          </span>
        ) : null}
      </div>
      {openReports.length > 0 ? (
        <ul aria-label={t("reasons")} className="flex flex-col gap-1 pl-6">
          {openReports.map((report, index) => (
            <li
              key={`${report.createdAt}-${index}`}
              className="flex flex-wrap items-baseline gap-x-2"
            >
              <span className="font-medium">{t(report.reason)}</span>
              {report.note ? (
                <span className="min-w-0 break-words">{report.note}</span>
              ) : null}
              <RelativeTime date={report.createdAt} className="text-xs" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
