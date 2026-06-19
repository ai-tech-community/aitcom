"use client";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { ErrorState } from "@/components/ui/error-state";

function delta(now: number, prev: number) {
  if (prev === 0) return now === 0 ? "—" : "+∞";
  const pct = Math.round(((now - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

export function HealthPulse({ slug }: { slug: string }) {
  const t = useTranslations("communities.insights");
  const { data, isLoading, isError, refetch } =
    api.insights.healthPulse.useQuery({ slug });
  if (isError) {
    return <ErrorState onRetry={() => void refetch()} />;
  }
  if (isLoading || !data) {
    return (
      <div
        role="status"
        aria-label={t("loading")}
        className="h-24 animate-pulse rounded-lg border"
      />
    );
  }
  const cards = [
    {
      label: t("kpiActive"),
      value: data.activeNow,
      sub: delta(data.activeNow, data.activePrev),
    },
    { label: t("kpiNewJoins"), value: data.newJoins, sub: "" },
    { label: t("kpiDeparted"), value: data.departures, sub: "" },
    {
      label: t("kpiContributions"),
      value: data.contributionCount,
      sub: delta(data.contributionCount, data.contributionPrev),
    },
  ];
  return (
    <section
      aria-label={t("healthSection")}
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map((c) => (
        <article
          key={c.label}
          className="border-border bg-card/80 rounded-lg border p-4"
        >
          <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
            {c.label}
          </p>
          <p className="text-foreground mt-2 text-2xl font-semibold tracking-tight">
            {c.value}
          </p>
          {c.sub ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {c.sub} {t("kpiVsPrior")}
            </p>
          ) : null}
        </article>
      ))}
    </section>
  );
}
