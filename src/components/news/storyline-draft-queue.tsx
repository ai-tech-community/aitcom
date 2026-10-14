"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";

/** Editor queue of every pending news storyline draft, with approve and reject. */
export function StorylineDraftQueue({
  heading = true,
}: {
  heading?: boolean;
} = {}) {
  const t = useTranslations("newsStories.draftReview");
  const utils = api.useUtils();
  const queue = api.news.listStorylineDraftQueue.useQuery();
  const refresh = () => {
    void utils.news.listStorylineDraftQueue.invalidate();
    void utils.news.listMyStorylineDrafts.invalidate();
    void utils.news.listAgentStorylineDrafts.invalidate();
  };
  const approve = api.news.approveAgentStorylineDraft.useMutation({
    onSuccess: () => {
      toast.success(t("approved"));
      refresh();
    },
    onError: () => toast.error(t("approveFailed")),
  });
  const reject = api.news.dismissAgentStorylineDraft.useMutation({
    onSuccess: () => {
      toast.success(t("rejected"));
      refresh();
    },
    onError: () => toast.error(t("actionFailed")),
  });
  const pending = approve.isPending || reject.isPending;

  return (
    <section
      aria-labelledby={heading ? "storyline-draft-queue" : undefined}
      className="space-y-4"
    >
      {heading ? (
        <SectionLabel id="storyline-draft-queue">{t("section")}</SectionLabel>
      ) : null}
      <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
        {t("queueHelp")}
      </p>
      {queue.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : queue.isError ? (
        <ErrorState
          title={t("actionFailed")}
          onRetry={() => void queue.refetch()}
        />
      ) : queue.data.length === 0 ? (
        <EmptyState title={t("empty")} description={t("queueHelp")} />
      ) : (
        <ul className="divide-y border-t">
          {queue.data.map((draft) => (
            <li
              key={draft.id}
              className="flex flex-wrap items-start justify-between gap-4 py-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{draft.title}</p>
                {draft.overview ? (
                  <p className="text-muted-foreground mt-1 max-w-prose text-sm leading-relaxed">
                    {draft.overview}
                  </p>
                ) : null}
                <p className="text-muted-foreground mt-1 text-sm">
                  {t("proposedBy", { agent: draft.agentName })}
                </p>
                <p className="text-muted-foreground mt-1 font-mono text-xs">
                  {t("draftId", { id: draft.id })}
                </p>
                <Link
                  href={draft.reviewPath as never}
                  className="mt-2 inline-flex text-sm font-medium underline underline-offset-4"
                >
                  {t("review")}
                </Link>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => approve.mutate({ draftId: draft.id })}
                >
                  {t("approve")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => reject.mutate({ draftId: draft.id })}
                >
                  {t("reject")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
