"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  ReportForm,
  type ReportDraft,
} from "@/components/moderation/report-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  type ReportReason,
} from "@/lib/post-report-reasons";
import { api } from "@/trpc/react";

const FRESH: ReportDraft<ReportReason> = { reason: "spam", note: "" };

/**
 * Lets a member report a post with a reason and an optional note. The first
 * report hides the post, so both feed queries are refreshed on success.
 */
export function ReportDialog({
  postId,
  open,
  onOpenChange,
}: {
  postId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("communities.report");
  const utils = api.useUtils();
  const [draft, setDraft] = useState(FRESH);
  const report = api.feed.reportPost.useMutation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <ReportForm
          name={`report-${postId}`}
          reasons={REPORT_REASONS}
          reasonLabel={(id) => t(id)}
          draft={draft}
          onDraftChange={setDraft}
          noteMax={REPORT_NOTE_MAX}
          labels={{
            reasons: t("reasonLabel"),
            note: t("noteLabel"),
            submit: t("submit"),
          }}
          pending={report.isPending}
          onSubmit={(input) =>
            report.mutate(
              { postId, ...input },
              {
                onSuccess: () => {
                  toast.success(t("sent"));
                  setDraft(FRESH);
                  onOpenChange(false);
                  void utils.feed.getActivity.invalidate();
                  void utils.feed.getHomeActivity.invalidate();
                  void utils.feed.getFeed.invalidate();
                  void utils.feed.getReels.invalidate();
                },
                onError: (error) =>
                  toast.error(
                    error.data?.code === "CONFLICT"
                      ? t("alreadyReported")
                      : t("failed"),
                  ),
              },
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}
