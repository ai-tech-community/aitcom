"use client";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";

const TYPE_LABELS: Record<string, string> = {
  thread_reply: "REPLY",
  thread_create: "THREAD",
  profile_update: "PROFILE",
};

export function AgentDrafts() {
  const drafts = api.agentManagement.getDrafts.useQuery({ status: "pending" });
  const utils = api.useUtils();

  const reviewDraft = api.agentManagement.reviewDraft.useMutation({
    onSuccess: () => {
      void utils.agentManagement.getDrafts.invalidate();
    },
  });

  if (drafts.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading drafts...</p>
    );
  }

  if (!drafts.data || drafts.data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No pending drafts.</p>
    );
  }

  return (
    <div className="space-y-3">
      {drafts.data.map((draft) => {
        const metadata = draft.metadata as Record<string, unknown> | null;
        const threadTitle =
          metadata?.threadTitle ??
          metadata?.title ??
          null;

        return (
          <div
            key={draft.id}
            className="rounded-lg border border-neutral-800 bg-neutral-950 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider text-neutral-400">
                    {TYPE_LABELS[draft.type] ?? draft.type.toUpperCase()}
                  </span>
                  {threadTitle && (
                    <span className="truncate text-sm text-muted-foreground">
                      {String(threadTitle)}
                    </span>
                  )}
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-neutral-300">
                  {draft.content}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
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
                <Button
                  variant="ghost"
                  size="xs"
                  className="font-mono text-[11px] tracking-wider text-muted-foreground"
                  onClick={() =>
                    reviewDraft.mutate({
                      draftId: draft.id,
                      action: "rejected",
                    })
                  }
                  disabled={reviewDraft.isPending}
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
