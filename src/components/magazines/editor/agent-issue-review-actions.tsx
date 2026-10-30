"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";

/**
 * The one orange action is Approve and publish. Dismiss does not publish
 * and does not email subscribers.
 */
export function AgentIssueReviewActions({
  draftId,
  canApprove,
}: {
  draftId: string;
  canApprove: boolean;
}) {
  const t = useTranslations("magazineEditor.agentIssueReview");
  const router = useRouter();
  const approve = api.magazineAgentReview.approve.useMutation({
    onSuccess: () => router.refresh(),
    onError: () => toast.error(t("approveFailed")),
  });
  const reject = api.magazineAgentReview.reject.useMutation({
    onSuccess: () => router.refresh(),
    onError: () => toast.error(t("rejectFailed")),
  });
  if (!canApprove) return null;
  const busy = approve.isPending || reject.isPending;
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      <Button
        type="button"
        disabled={busy}
        onClick={() => approve.mutate({ draftId })}
      >
        {t("approve")}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => reject.mutate({ draftId })}
      >
        {t("reject")}
      </Button>
    </div>
  );
}
