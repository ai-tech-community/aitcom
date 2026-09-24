"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REPORT_REASONS, type ReportReason } from "@/lib/post-report-reasons";
import { api } from "@/trpc/react";

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
  const [reason, setReason] = useState<ReportReason>("spam");
  const [note, setNote] = useState("");
  const report = api.feed.reportPost.useMutation();
  const noteId = `report-note-${postId}`;

  function submit() {
    const trimmed = note.trim();
    report.mutate(
      { postId, reason, ...(trimmed ? { note: trimmed } : {}) },
      {
        onSuccess: () => {
          toast.success(t("sent"));
          setReason("spam");
          setNote("");
          onOpenChange(false);
          void utils.feed.getActivity.invalidate();
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
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            {t("reasonLabel")}
          </legend>
          {REPORT_REASONS.map((id) => (
            <label key={id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`report-reason-${postId}`}
                value={id}
                checked={reason === id}
                onChange={() => setReason(id)}
                className="focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
              />
              {t(id)}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-2">
          <Label htmlFor={noteId}>{t("noteLabel")}</Label>
          <Textarea
            id={noteId}
            maxLength={500}
            rows={3}
            className="resize-none"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" disabled={report.isPending} onClick={submit}>
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
