"use client";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { SectionLabel } from "@/components/ui/section-label";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatisticsDashboard } from "./statistics-dashboard";
import { MagazinePerformance } from "./magazine-performance";
import { HealthPulse } from "./health-pulse";
import { AtRiskList } from "./at-risk-list";
import { UnactivatedList } from "./unactivated-list";
import { ActivationFunnel } from "../activation/activation-funnel";
import { AwaitingResponseList } from "../activation/awaiting-response-list";

export function InsightsDashboard({ slug }: { slug: string }) {
  const t = useTranslations("communities.insights.statistics");
  const {
    data: memberships,
    isLoading,
    isError,
    refetch,
  } = api.communities.getMyCommunities.useQuery();
  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isLoading || !memberships)
    return (
      <div role="status" aria-label={t("loading")} className="space-y-4 py-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    );
  const membership = memberships?.find((item) => item.slug === slug);
  const canViewStatistics =
    membership?.status === "active" &&
    (membership.role === "owner" || membership.role === "admin");
  return (
    <div className="@container min-w-0 space-y-8 py-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-2 max-w-prose text-sm">
          {t(canViewStatistics ? "description" : "operationalDescription")}
        </p>
      </header>
      {canViewStatistics ? (
        <StatisticsDashboard slug={slug} />
      ) : (
        <HealthPulse slug={slug} />
      )}
      {canViewStatistics && <MagazinePerformance slug={slug} />}
      <div className="space-y-2">
        <SectionLabel>{t("followUpTitle")}</SectionLabel>
        <p className="text-muted-foreground text-sm">
          {t("followUpDescription")}
        </p>
      </div>
      <ActivationFunnel slug={slug} />
      <div className="grid gap-6 @3xl:grid-cols-2">
        <AtRiskList slug={slug} />
        <UnactivatedList slug={slug} />
        <AwaitingResponseList slug={slug} />
      </div>
    </div>
  );
}
