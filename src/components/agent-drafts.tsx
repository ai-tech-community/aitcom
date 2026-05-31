"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";

const TYPE_LABELS: Record<string, string> = {
  thread_reply: "REPLY",
  thread_create: "THREAD",
  profile_update: "PROFILE",
  revival_nudge: "REVIVAL",
};

export function AgentDrafts() {
  const t = useTranslations("advisory");
  const drafts = api.agentManagement.getDrafts.useQuery({ status: "pending" });
  const utils = api.useUtils();

  const reviewDraft = api.agentManagement.reviewDraft.useMutation({
    onSuccess: () => {
      void utils.agentManagement.getDrafts.invalidate();
    },
  });

  const sendRevival = api.agentManagement.reviewDraft.useMutation({
    onSuccess: () => {
      toast.success(t("revivalSent"));
      void utils.agentManagement.getDrafts.invalidate();
    },
  });

  if (drafts.isLoading) {
    return <p className="text-muted-foreground text-sm">Loading drafts...</p>;
  }

  if (!drafts.data || drafts.data.length === 0) {
    return <p className="text-muted-foreground text-sm">No pending drafts.</p>;
  }

  return (
    <div className="space-y-3">
      {drafts.data.map((draft) => {
        const metadata = draft.metadata;
        const threadTitle =
          typeof metadata?.threadTitle === "string"
            ? metadata.threadTitle
            : typeof metadata?.title === "string"
              ? metadata.title
              : null;

        return (
          <div
            key={draft.id}
            className="border-border hover:bg-secondary/50 rounded-lg border p-4 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider">
                    {TYPE_LABELS[draft.type] ?? draft.type.toUpperCase()}
                  </span>
                  {threadTitle && (
                    <span className="text-muted-foreground truncate text-sm">
                      {String(threadTitle)}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">
                  {draft.content}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {draft.type === "revival_nudge" ? (
                  <Button
                    size="xs"
                    className="font-mono text-[11px] tracking-wider"
                    onClick={() =>
                      sendRevival.mutate({
                        draftId: draft.id,
                        action: "approved",
                      })
                    }
                    disabled={sendRevival.isPending}
                  >
                    {t("approveSend")}
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    className="font-mono text-[11px] tracking-wider"
                    onClick={() =>
                      reviewDraft.mutate({
                        draftId: draft.id,
                        action: "approved",
                      })
                    }
                    disabled={reviewDraft.isPending}
                  >
                    Approve & Post
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground font-mono text-[11px] tracking-wider"
                  onClick={() =>
                    reviewDraft.mutate({
                      draftId: draft.id,
                      action: "rejected",
                    })
                  }
                  disabled={reviewDraft.isPending || sendRevival.isPending}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
