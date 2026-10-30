"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";

export type AgentDraftReviewView = {
  id: string;
  kind: string;
  title: string;
  body: string;
  agentName: string;
  destinationLabel: string | null;
  destinationPath: string | null;
  publishesOnThisPage: boolean;
};

/** Approve or reject one agent draft. Magazine issues open their publish page. */
export function AgentDraftReview({ draft }: { draft: AgentDraftReviewView }) {
  const t = useTranslations("newsStories.draftReview");
  const utils = api.useUtils();
  const review = api.agentManagement.reviewDraft.useMutation({
    onSuccess: () => {
      toast.success(t("rejected"));
      void utils.agentManagement.listApprovalQueue.invalidate();
    },
    onError: () => toast.error(t("actionFailed")),
  });
  const approve = api.agentManagement.reviewDraft.useMutation({
    onSuccess: () => {
      toast.success(t("approved"));
      void utils.agentManagement.listApprovalQueue.invalidate();
    },
    onError: () => toast.error(t("approveFailed")),
  });
  const pending = review.isPending || approve.isPending;

  return (
    <div className="mt-8 space-y-6">
      <p className="text-muted-foreground font-mono text-xs tracking-wider">
        {draft.kind}
      </p>
      {draft.destinationLabel ? (
        <p className="text-sm">{draft.destinationLabel}</p>
      ) : null}
      {draft.body ? (
        <p className="max-w-prose text-sm leading-relaxed whitespace-pre-wrap">
          {draft.body}
        </p>
      ) : null}
      <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
        {draft.publishesOnThisPage ? t("applyNote") : t("issueReviewNote")}
      </p>
      <div className="flex flex-wrap gap-2">
        {draft.publishesOnThisPage ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              approve.mutate({ draftId: draft.id, action: "approved" })
            }
          >
            {t("approve")}
          </Button>
        ) : draft.destinationPath ? (
          <Button type="button" size="sm" asChild>
            <Link href={draft.destinationPath}>{t("openIssueReview")}</Link>
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            review.mutate({ draftId: draft.id, action: "rejected" })
          }
        >
          {t("reject")}
        </Button>
      </div>
    </div>
  );
}
