"use client";

import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";

/** Staff review of story ideas and source links. Names come from stored accounts. */
export function StorySuggestionInbox() {
  const t = useTranslations("newsStories.contribute");
  const fmt = useFormatter();
  const utils = api.useUtils();
  const inbox = api.news.listOpenStorySuggestions.useQuery();
  const review = api.news.reviewStorySuggestion.useMutation({
    onSuccess: () => {
      toast.success(t("suggestionReviewed"));
      void utils.news.listOpenStorySuggestions.invalidate();
    },
    onError: () => toast.error(t("suggestShort")),
  });

  return (
    <section className="mt-10" aria-labelledby="suggestion-inbox-heading">
      <h2 id="suggestion-inbox-heading" className="text-xl font-semibold">
        {t("suggestionInbox")}
      </h2>
      {inbox.isPending ? (
        <Skeleton className="mt-4 h-16 w-full" />
      ) : inbox.isError ? (
        <ErrorState
          title={t("coverageFailed")}
          onRetry={() => void inbox.refetch()}
        />
      ) : inbox.data.length === 0 ? (
        <EmptyState title={t("suggestionEmpty")} />
      ) : (
        <ul className="mt-4 divide-y border-t">
          {inbox.data.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 py-4"
            >
              <div className="min-w-0">
                <p className="text-sm">{row.body}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {row.submitter}
                </p>
                <p className="text-muted-foreground mt-1 font-mono text-xs">
                  {fmt.dateTime(row.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={review.isPending}
                onClick={() => review.mutate({ id: row.id })}
              >
                {t("suggestionReview")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
