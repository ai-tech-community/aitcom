"use client";

import { useTranslations } from "next-intl";

import { api } from "@/trpc/react";
import { PointsChart } from "@/components/gamification/points-chart";
import { PointsAwards } from "@/components/gamification/points-awards";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";

// Reason codes that have a dedicated `points.<key>` label; anything else
// falls back to the generic "activity" label.
const KNOWN_REASONS = ["activity", "course_complete"];

/**
 * The signed-in member's XP-over-time chart + recent points history, from the
 * points_event log (members.getMyPointsChart / getMyPointsHistory). Supplementary:
 * hides until there is data (the log is forward-only from when it shipped).
 */
export function PointsWidget() {
  const t = useTranslations("points");
  const chart = api.members.getMyPointsChart.useQuery();
  const history = api.members.getMyPointsHistory.useQuery();

  if (chart.isLoading || history.isLoading) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }
  if (chart.isError || history.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void chart.refetch();
          void history.refetch();
        }}
      />
    );
  }

  const chartData = chart.data ?? [];
  const historyData = history.data ?? [];
  if (chartData.length === 0 && historyData.length === 0) return null;

  const awards = historyData.map((e) => {
    const key = e.reason.replace(/\./g, "_");
    const metricName = KNOWN_REASONS.includes(key) ? t(key) : t("activity");
    return {
      id: e.id,
      awarded: e.awarded,
      date: e.date,
      total: e.total,
      trigger: { id: e.id, type: e.type, points: e.awarded, metricName },
    };
  });

  return (
    <div className="space-y-4">
      {chartData.length > 0 && (
        <>
          <SectionLabel>{t("chartTitle")}</SectionLabel>
          <div className="border-border bg-card rounded-xl border p-6">
            <PointsChart
              data={chartData}
              title={t("chartTitle")}
              height={260}
            />
          </div>
        </>
      )}
      {awards.length > 0 && (
        <>
          <SectionLabel>{t("historyTitle")}</SectionLabel>
          <PointsAwards awards={awards} />
        </>
      )}
    </div>
  );
}
