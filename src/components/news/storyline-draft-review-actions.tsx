"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";

export function StorylineDraftReviewActions({
  draftId,
  canApprove,
  pending,
}: {
  draftId: string;
  canApprove: boolean;
  pending: boolean;
}) {
  const t = useTranslations("newsStories.draftReview");
  const router = useRouter();
  const utils = api.useUtils();
  const done = () => {
    void utils.news.listStorylineDraftQueue.invalidate();
    void utils.news.listMyStorylineDrafts.invalidate();
    router.refresh();
  };
  const approve = api.news.approveAgentStorylineDraft.useMutation({
    onSuccess: () => {
      toast.success(t("approved"));
      done();
    },
    onError: () => toast.error(t("approveFailed")),
  });
  const rejectAsEditor = api.news.dismissAgentStorylineDraft.useMutation({
    onSuccess: () => {
      toast.success(t("rejected"));
      done();
    },
    onError: () => toast.error(t("actionFailed")),
  });
  const rejectAsOwner = api.agentManagement.reviewDraft.useMutation({
    onSuccess: () => {
      toast.success(t("rejected"));
      done();
    },
    onError: () => toast.error(t("actionFailed")),
  });
  const busy =
    approve.isPending || rejectAsEditor.isPending || rejectAsOwner.isPending;

  if (!pending) return null;

  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {canApprove ? (
        <Button
          type="button"
          disabled={busy}
          onClick={() => approve.mutate({ draftId })}
        >
          {t("approve")}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() =>
          canApprove
            ? rejectAsEditor.mutate({ draftId })
            : rejectAsOwner.mutate({ draftId, action: "rejected" })
        }
      >
        {t("reject")}
      </Button>
    </div>
  );
}
