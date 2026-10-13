"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StorylineLoading } from "./storyline-states";
import type { StorylineSuggestion } from "@/lib/news/storyline-suggestions";

export function StorylineSuggestions({
  locked,
  onReview,
}: {
  locked: boolean;
  onReview: (draft: StorylineSuggestion) => void;
}) {
  const t = useTranslations("newsStories");
  const [started, setStarted] = useState(false);
  const suggest = api.news.suggestStorylines.useMutation();
  const errorKeys = [
    "configuration",
    "provider",
    "invalid",
    "cooldown",
  ] as const;
  const errorCode = errorKeys.find((key) => key === suggest.error?.message);
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
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={locked || suggest.isPending}
          onClick={() => {
            setStarted(true);
            suggest.mutate();
          }}
        >
          {t("suggestions.generate")}
        </Button>
      </div>
      {suggest.isPending && <StorylineLoading />}
      {suggest.error && (
        <ErrorState
          title={errorCode ? t(`suggestions.errors.${errorCode}`) : t("failed")}
          description={t("suggestions.recovery")}
          onRetry={() => {
            if (!locked) suggest.mutate();
          }}
          retryLabel={t("retry")}
        />
      )}
      {started && suggest.isSuccess && !suggest.data?.drafts.length && (
        <EmptyState
          title={t("suggestions.empty")}
          description={t("suggestions.emptyHelp")}
        />
      )}
      {suggest.isSuccess && !!suggest.data?.discarded && (
        <p role="status" className="text-muted-foreground mt-4 text-sm">
          {t("suggestions.discarded", { count: suggest.data.discarded })}
        </p>
      )}
      {!!suggest.data?.drafts.length && (
        <div className="border-border mt-5 divide-y border-t">
          {suggest.data.drafts.map((draft) => (
            <article
              key={draft.input.slug}
              className="flex flex-wrap items-start justify-between gap-4 py-5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-xs">
                  {t("suggestions.label")}
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
                disabled={locked || suggest.isPending}
                onClick={() => onReview(draft)}
              >
                {t("suggestions.review")}
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
