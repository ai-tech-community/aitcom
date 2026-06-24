"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

const TYPE_LABELS: Record<string, string> = {
  thread_reply: "REPLY",
  thread_create: "THREAD",
  profile_update: "PROFILE",
  revival_nudge: "REVIVAL",
  welcome_nudge: "WELCOME",
  feed_post: "FEED POST",
  feed_comment: "FEED COMMENT",
  challenge_channel_post: "CHALLENGE POST",
  challenge_channel_reply: "CHALLENGE REPLY",
};

type DraftMetadata = {
  threadTitle?: unknown;
  title?: unknown;
  destinationLabel?: unknown;
  destinationPath?: unknown;
  postPreview?: unknown;
  communityName?: unknown;
};

function stringMetadataValue(
  metadata: DraftMetadata | null | undefined,
  key: keyof DraftMetadata,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

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

  if (drafts.isError) {
    return <ErrorState onRetry={() => void drafts.refetch()} />;
  }

  if (!drafts.data || drafts.data.length === 0) {
    return <p className="text-muted-foreground text-sm">No pending drafts.</p>;
  }

  return (
    <div className="space-y-3">
      {drafts.data.map((draft) => {
        const metadata = draft.metadata as DraftMetadata | null;
        const threadTitle =
          stringMetadataValue(metadata, "threadTitle") ??
          stringMetadataValue(metadata, "title");
        const destinationLabel = stringMetadataValue(
          metadata,
          "destinationLabel",
        );
        const destinationPath = stringMetadataValue(
          metadata,
          "destinationPath",
        );
        const postPreview = stringMetadataValue(metadata, "postPreview");

        return (
          <div
            key={draft.id}
            className="border-border hover:bg-secondary/50 rounded-lg border p-4 transition-colors"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-xs font-medium tracking-wider">
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
                {destinationLabel && (
                  <div className="border-border bg-muted/30 mt-3 rounded-md border px-3 py-2 text-xs">
                    <div className="text-muted-foreground font-mono tracking-wider">
                      WILL PUBLISH TO
                    </div>
                    <div className="mt-1 font-medium">{destinationLabel}</div>
                    {destinationPath && (
                      <div className="text-muted-foreground mt-0.5 font-mono">
                        {destinationPath}
                      </div>
                    )}
                    {postPreview && (
                      <p className="text-muted-foreground mt-2 line-clamp-2">
                        In reply to: {postPreview}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2 sm:shrink-0">
                {draft.type === "revival_nudge" ||
                draft.type === "welcome_nudge" ? (
                  <Button
                    size="xs"
                    className="font-mono text-xs tracking-wider"
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
                    className="font-mono text-xs tracking-wider"
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
                  className="text-muted-foreground font-mono text-xs tracking-wider"
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
