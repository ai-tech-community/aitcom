"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

type Range = "7d" | "30d" | "90d" | "all";

function Sparkline({ data }: { data: Array<{ date: string; value: number }> }) {
  if (data.length === 0) return <p className="text-xs text-zinc-400">No data</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-px h-8">
      {data.map((d) => (
        <div
          key={d.date}
          className="flex-1 bg-zinc-900 rounded-t-sm"
          style={{ height: `${(d.value / max) * 100}%`, minHeight: 1 }}
        />
      ))}
    </div>
  );
}

export function QADashboard() {
  const t = useTranslations("impact");
  const [range, setRange] = useState<Range>("30d");

  const { data, isLoading, error } = api.impact.getQADetails.useQuery({ range });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
        <p className="font-mono text-xs text-zinc-500">{t("loading")}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
        <p className="font-mono text-xs text-red-600">{t("error")}</p>
      </div>
    );
  }

  const rangeButtons: Array<{ value: Range; label: string }> = [
    { value: "7d", label: t("qa.timeRange7d") },
    { value: "30d", label: t("range30d") },
    { value: "90d", label: t("qa.timeRange90d") },
    { value: "all", label: t("rangeAllTime") },
  ];

  const metricCards: Array<{ label: string; value: string | number }> = [
    { label: t("core.totalContributions"), value: data.metrics.totalContributions },
    { label: t("core.aiAssisted"), value: data.metrics.aiAssisted },
    { label: t("core.humanReviewedAi"), value: data.metrics.humanReviewed },
    {
      label: t("core.collaborationRate"),
      value: `${(data.metrics.collaborationRate * 100).toFixed(1)}%`,
    },
    {
      label: t("core.forumHelpfulness"),
      value: `${(data.metrics.forumHelpfulness * 100).toFixed(1)}%`,
    },
  ];

  const sparklineEntries: Array<{
    label: string;
    data: Array<{ date: string; value: number }>;
  }> = [
    { label: t("core.totalContributions"), data: data.sparklines.totalContributions },
    { label: t("core.collaborationRate"), data: data.sparklines.collaborationRate },
    { label: t("core.forumHelpfulness"), data: data.sparklines.forumHelpfulness },
    {
      label: t("experimental.humanOverrideRate.title"),
      data: data.sparklines.overrideRate,
    },
    {
      label: t("experimental.creativityIndex.title"),
      data: data.sparklines.creativityIndex,
    },
  ];

  const personalityEntries = Object.entries(
    data.metrics.personalityDistribution as Record<string, number>,
  );
  const personalityMax = Math.max(...personalityEntries.map(([, v]) => v), 1);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-12 sm:px-10">
      {/* Header */}
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          {t("qa.subtitle")}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900">
            {t("qa.title")}
          </h1>
          <div className="flex items-center gap-2">
            {rangeButtons.map((btn) => (
              <button
                key={btn.value}
                type="button"
                onClick={() => setRange(btn.value)}
                className={`rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest ${
                  range === btn.value
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white text-zinc-600"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Confidence + data point count */}
      <div className="flex items-center gap-4">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-widest ${
            data.confidence === "low"
              ? "bg-amber-100 text-amber-800"
              : "bg-green-100 text-green-800"
          }`}
        >
          {data.confidence === "low" ? "Low confidence" : "OK"}
        </span>
        <span className="font-mono text-xs text-zinc-500">
          {data.dataPoints} data points
        </span>
      </div>

      {/* Metric summary cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metricCards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-zinc-200 bg-white p-4"
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {card.label}
            </p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{card.value}</p>
          </div>
        ))}
      </section>

      {/* Sparkline previews */}
      <section className="space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Sparklines
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sparklineEntries.map((entry) => (
            <div
              key={entry.label}
              className="rounded-lg border border-zinc-200 bg-white p-4"
            >
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                {entry.label}
              </p>
              <Sparkline data={entry.data} />
            </div>
          ))}
        </div>
      </section>

      {/* Personality distribution */}
      {personalityEntries.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-mono text-xs uppercase tracking-widest text-zinc-500">
            {t("experimental.agentPersonalityMix.title")}
          </h2>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="space-y-2">
              {personalityEntries.map(([label, value]) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    {label}
                  </span>
                  <div className="h-3 flex-1 rounded-full bg-zinc-100">
                    <div
                      className="h-3 rounded-full bg-zinc-900"
                      style={{
                        width: `${(value / personalityMax) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-10 text-right font-mono text-xs text-zinc-600">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Learning loop signal */}
      <section className="space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          {t("experimental.learningLoop.title")}
        </h2>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-widest ${
            data.metrics.learningLoopSignal === "improving"
              ? "bg-green-100 text-green-800"
              : data.metrics.learningLoopSignal === "declining"
                ? "bg-red-100 text-red-800"
                : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {t(`experimental.${data.metrics.learningLoopSignal}`)}
        </span>
      </section>

      {/* Admin section */}
      {data.admin && (
        <section className="space-y-4 rounded-lg border border-zinc-300 bg-zinc-50 p-6">
          <h2 className="font-mono text-xs uppercase tracking-widest text-zinc-700">
            {t("qa.dataQuality")}
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Total Events
              </p>
              <p className="mt-1 text-2xl font-bold text-zinc-900">
                {data.admin.dataQuality.totalEvents}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                With Session ID
              </p>
              <p className="mt-1 text-2xl font-bold text-zinc-900">
                {data.admin.dataQuality.withSessionId.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                With Personality Label
              </p>
              <p className="mt-1 text-2xl font-bold text-zinc-900">
                {data.admin.dataQuality.withPersonality.toFixed(1)}%
              </p>
            </div>
          </div>

          <h3 className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Aggregate Row Counts
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Core
              </p>
              <p className="mt-1 text-xl font-bold text-zinc-900">
                {data.admin.aggregateRows.core}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Mix
              </p>
              <p className="mt-1 text-xl font-bold text-zinc-900">
                {data.admin.aggregateRows.mix}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Experimental
              </p>
              <p className="mt-1 text-xl font-bold text-zinc-900">
                {data.admin.aggregateRows.experimental}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
