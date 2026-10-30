"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import type { StatisticsDays } from "@/server/communities/statistics";
import { StatisticsView } from "./statistics-view";

export function StatisticsDashboard({ slug }: { slug: string }) {
  const t = useTranslations("communities.insights.statistics");
  const [days, setDays] = useState<StatisticsDays>(30);
  const query = api.insights.statistics.useQuery({ slug, days });
  return (
    <section aria-label={t("sectionLabel")} className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{t("completeDays")}</p>
        <SegmentedControl
          aria-label={t("periodSelector")}
          value={String(days)}
          onValueChange={(value) => setDays(Number(value) as StatisticsDays)}
          options={([7, 30, 90] as const).map((value) => ({
            value: String(value),
            label: t("days", { count: value }),
          }))}
        />
      </div>
      {query.isError ? (
        <ErrorState
          title={t("errorTitle")}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading || !query.data ? (
        <div role="status" aria-label={t("loading")} className="space-y-5">
          <Skeleton className="h-14" />
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <StatisticsView data={query.data} slug={slug} />
      )}
    </section>
  );
}
