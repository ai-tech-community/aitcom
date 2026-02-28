"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { AudienceBlocks } from "./audience-blocks";
import { ExperimentalInsights } from "./experimental-insights";
import { KpiStrip } from "./kpi-strip";
import { MethodologyPanel } from "./methodology-panel";
import { TrendPanels } from "./trend-panels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Range = "30d" | "all";

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function ImpactPage() {
  const t = useTranslations("impact");
  const [range, setRange] = useState<Range>("30d");

  const overviewQuery = api.impact.getOverview.useQuery({ range });

  const lastUpdatedLabel = useMemo(() => {
    if (!overviewQuery.data?.lastUpdatedAt) return t("lastUpdated", { date: "-" });
    return t("lastUpdated", { date: formatDate(overviewQuery.data.lastUpdatedAt) });
  }, [overviewQuery.data?.lastUpdatedAt, t]);

  if (overviewQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
        <p className="font-mono text-xs text-zinc-500">{t("loading")}</p>
      </div>
    );
  }

  if (overviewQuery.error || !overviewQuery.data) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
        <p className="font-mono text-xs text-red-600">{t("error")}</p>
      </div>
    );
  }

  const data = overviewQuery.data;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-12 sm:px-10">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          {t("subtitle")}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900">{t("title")}</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRange("30d")}
              className={`rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest ${
                range === "30d"
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-600"
              }`}
            >
              {t("range30d")}
            </button>
            <button
              type="button"
              onClick={() => setRange("all")}
              className={`rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest ${
                range === "all"
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-600"
              }`}
            >
              {t("rangeAllTime")}
            </button>
          </div>
        </div>
        <a href="#methodology" className="font-mono text-[10px] uppercase tracking-widest text-zinc-600 underline">
          {t("methodology")}
        </a>
      </header>

      <Tabs defaultValue="core" className="space-y-6">
        <TabsList variant="line">
          <TabsTrigger value="core">{t("coreTab")}</TabsTrigger>
          <TabsTrigger value="experimental">{t("experimentalTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="core" className="space-y-6">
          <KpiStrip
            labels={{
              totalContributions: t("core.totalContributions"),
              aiAssisted: t("core.aiAssisted"),
              humanReviewedAi: t("core.humanReviewedAi"),
              collaborationRate: t("core.collaborationRate"),
              forumHelpfulness: t("core.forumHelpfulness"),
              medianFirstResponse: t("core.medianFirstResponse"),
              challengeParticipation: t("core.challengeParticipation"),
              challengeCompletion: t("core.challengeCompletion"),
              eventLinkedParticipation: t("core.eventLinkedParticipation"),
              collaborationGrowth4w: t("core.collaborationGrowth4w"),
            }}
            values={data.kpis}
          />

          <AudienceBlocks
            labels={{
              visitorsTitle: t("audience.visitors.title"),
              visitorsDescription: t("audience.visitors.description"),
              membersTitle: t("audience.members.title"),
              membersDescription: t("audience.members.description"),
              sponsorsTitle: t("audience.sponsors.title"),
              sponsorsDescription: t("audience.sponsors.description"),
            }}
            data={data.audienceBlocks}
          />

          <TrendPanels
            labels={{
              collaborationRateWeekly: t("trends.collaborationRateWeekly"),
              contributionMix: t("trends.contributionMix"),
            }}
            weeklyCollaboration={data.trends.weeklyCollaboration}
            contributionMix={data.trends.contributionMix}
          />
        </TabsContent>

        <TabsContent value="experimental" className="space-y-6">
          <ExperimentalInsights
            title={t("experimental.title")}
            badge={t("experimental.badge")}
            openDetails={t("experimental.openDetails")}
            labels={{
              agentPersonalityMix: {
                title: t("experimental.agentPersonalityMix.title"),
                definition: t("experimental.agentPersonalityMix.definition"),
                calculation: t("experimental.agentPersonalityMix.calculation"),
                why: t("experimental.agentPersonalityMix.why"),
                caveats: t("experimental.agentPersonalityMix.caveats"),
              },
              humanOverrideRate: {
                title: t("experimental.humanOverrideRate.title"),
                definition: t("experimental.humanOverrideRate.definition"),
                calculation: t("experimental.humanOverrideRate.calculation"),
                why: t("experimental.humanOverrideRate.why"),
                caveats: t("experimental.humanOverrideRate.caveats"),
              },
              creativityIndex: {
                title: t("experimental.creativityIndex.title"),
                definition: t("experimental.creativityIndex.definition"),
                calculation: t("experimental.creativityIndex.calculation"),
                why: t("experimental.creativityIndex.why"),
                caveats: t("experimental.creativityIndex.caveats"),
              },
              collaborationDepth: {
                title: t("experimental.collaborationDepth.title"),
                definition: t("experimental.collaborationDepth.definition"),
                calculation: t("experimental.collaborationDepth.calculation"),
                why: t("experimental.collaborationDepth.why"),
                caveats: t("experimental.collaborationDepth.caveats"),
              },
            }}
            values={data.experimental.items}
          />
        </TabsContent>
      </Tabs>

      <section className="grid gap-3 md:grid-cols-3">
        <Link
          href="/auth/signup"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
        >
          {t("cta.join")}
        </Link>
        <Link
          href="/challenges"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
        >
          {t("cta.challenge")}
        </Link>
        <Link
          href="/sponsors"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
        >
          {t("cta.partner")}
        </Link>
      </section>

      <MethodologyPanel
        title={t("methodologyPanel.title")}
        aggregateOnly={t("methodologyPanel.aggregateOnly")}
        freshness={t("methodologyPanel.freshness")}
        exclusions={t("methodologyPanel.exclusions")}
        lastUpdated={lastUpdatedLabel}
      />
    </div>
  );
}

