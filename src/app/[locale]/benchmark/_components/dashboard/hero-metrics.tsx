// src/app/[locale]/benchmark/_components/dashboard/hero-metrics.tsx
"use client";

import { useTranslations } from "next-intl";

type Props = {
  totalAnswers: number;
  modelsSampled: number;
  windowDays: 7 | 30 | 90;
};

export function HeroMetrics({
  totalAnswers,
  modelsSampled,
  windowDays,
}: Props) {
  const t = useTranslations("benchmark");
  const stats = [
    { label: t("hero.metricAnswers"), value: totalAnswers.toLocaleString() },
    { label: t("hero.metricModels"), value: modelsSampled.toLocaleString() },
    {
      label: t("hero.metricWindow"),
      value: t(`hero.window.${windowDays}` as const),
    },
  ];
  return (
    <div className="divide-border grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col gap-1 p-4 text-center">
          <span className="text-muted-foreground text-xs tracking-wide uppercase">
            {s.label}
          </span>
          <span className="text-2xl tabular-nums">{s.value}</span>
        </div>
      ))}
    </div>
  );
}
