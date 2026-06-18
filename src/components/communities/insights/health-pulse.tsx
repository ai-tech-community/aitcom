"use client";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

function delta(now: number, prev: number) {
  if (prev === 0) return now === 0 ? "—" : "+∞";
  const pct = Math.round(((now - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

export function HealthPulse({ slug }: { slug: string }) {
  const t = useTranslations("communities.insights");
  const { data, isLoading } = api.insights.healthPulse.useQuery({ slug });
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
          className="rounded-lg border border-border bg-card/80 p-4"
        >
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            {c.label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
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
