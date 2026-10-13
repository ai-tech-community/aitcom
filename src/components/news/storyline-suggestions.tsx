"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StorylineLoading } from "./storyline-states";
import type { StorylineSuggestion } from "@/lib/news/storyline-suggestions";

/** Contributions from user-connected agents, not platform-generated copy. */
export function StorylineSuggestions({
  locked,
  onReview,
}: {
  locked: boolean;
  onReview: (draft: StorylineSuggestion) => void;
}) {
  const t = useTranslations("newsStories");
  const utils = api.useUtils();
  const dismiss = api.news.dismissAgentStorylineDraft.useMutation({
    onSuccess: () => {
      void utils.news.listAgentStorylineDrafts.invalidate();
    },
  });
  const [page, setPage] = useState(1);
  const drafts = api.news.listAgentStorylineDrafts.useQuery(
    { page },
    { refetchOnWindowFocus: false },
  );
  return (
    <section
      className="border-border mb-8 border-b pb-8"
      aria-labelledby="suggestions-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-prose">
          <h2 id="suggestions-heading" className="text-xl font-semibold">
            {t("suggestions.title")}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            {t("suggestions.help")}
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("suggestions.agentInstructions")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={locked || drafts.isFetching}
          onClick={() => void drafts.refetch()}
        >
          {t("suggestions.refresh")}
        </Button>
      </div>
      {drafts.isLoading && <StorylineLoading />}
      {drafts.error && (
        <ErrorState
          title={t("loadFailed")}
          onRetry={locked ? undefined : () => void drafts.refetch()}
          retryLabel={t("retry")}
        />
      )}
      {drafts.data &&
        !drafts.data.items.length &&
        !drafts.data.invalidItems.length && (
          <EmptyState
            title={t("suggestions.empty")}
            description={t("suggestions.emptyHelp")}
          />
        )}
      {dismiss.error && (
        <ErrorState
          title={t("failed")}
          onRetry={() => void drafts.refetch()}
          retryLabel={t("retry")}
        />
      )}
      {!!drafts.data?.invalidItems.length && (
        <div className="mt-4">
          <p className="text-sm">{t("suggestions.invalid")}</p>
          <ul className="mt-3 space-y-3">
            {drafts.data.invalidItems.map((item) => (
              <li
                key={item.draftId}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span className="min-w-0 flex-1 text-sm">
                  {item.title} · {item.agentName}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={locked || dismiss.isPending}
                  onClick={() => dismiss.mutate({ draftId: item.draftId })}
                >
                  {t("suggestions.dismiss")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!drafts.data?.items.length && (
        <div className="border-border mt-5 divide-y border-t">
          {drafts.data.items.map((draft) => (
            <article
              key={draft.draftId}
              className="flex flex-wrap items-start justify-between gap-4 py-5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-xs">
                  {t("suggestions.label", { agent: draft.agentName })}
                </p>
                <h3 className="mt-1 text-lg font-semibold" lang="en">
                  {draft.input.titleEn}
                </h3>
                <p
                  className="text-muted-foreground mt-2 max-w-prose text-sm leading-relaxed"
                  lang="en"
                >
                  {draft.input.overviewEn}
                </p>
                <p className="mt-2 text-sm">
                  {t("articleCount", { count: draft.articles.length })}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={locked}
                onClick={() => onReview(draft)}
              >
                {t("suggestions.review")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={locked || dismiss.isPending}
                onClick={() => dismiss.mutate({ draftId: draft.draftId })}
              >
                {t("suggestions.dismiss")}
              </Button>
            </article>
          ))}
        </div>
      )}
      {drafts.data && drafts.data.totalPages > 1 && (
        <nav
          aria-label={t("suggestions.title")}
          className="mt-4 flex flex-wrap items-center gap-4"
        >
          <Button
            type="button"
            variant="outline"
            disabled={locked || drafts.data.page <= 1}
            onClick={() => setPage(drafts.data!.page - 1)}
          >
            {t("previous")}
          </Button>
          <span className="text-muted-foreground text-sm">
            {t("page", {
              page: drafts.data.page,
              total: drafts.data.totalPages,
            })}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={locked || drafts.data.page >= drafts.data.totalPages}
            onClick={() => setPage(drafts.data!.page + 1)}
          >
            {t("next")}
          </Button>
        </nav>
      )}
    </section>
  );
}
