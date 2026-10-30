"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/messages";
import { api } from "@/trpc/react";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MagazinePerformanceView } from "./magazine-performance-view";

/** A separate observer per community prevents stale magazine data crossing slugs. */
export function MagazinePerformance({ slug }: { slug: string }) {
  return <MagazinePerformanceQuery key={slug} slug={slug} />;
}

function MagazinePerformanceQuery({ slug }: { slug: string }) {
  const t = useTranslations("communities.insights.magazine");
  const locale = useLocale() as AppLocale;
  const [page, setPage] = useState(1);
  const query = api.insights.magazinePerformance.useQuery(
    { slug, locale, page },
    {
      placeholderData: (previous) => previous,
    },
  );
  return (
    <section
      aria-label={t("title")}
      className="min-w-0 space-y-5 border-t pt-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("scope")}</p>
      </div>
      {query.isError ? (
        <ErrorState title={t("error")} onRetry={() => void query.refetch()} />
      ) : query.isLoading || !query.data ? (
        <div role="status" aria-label={t("loading")} className="space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-52" />
        </div>
      ) : (
        <MagazinePerformanceView
          data={query.data}
          slug={slug}
          onPageChange={setPage}
          busy={query.isFetching}
        />
      )}
    </section>
  );
}
