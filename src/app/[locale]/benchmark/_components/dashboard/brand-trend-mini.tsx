// src/app/[locale]/benchmark/_components/dashboard/brand-trend-mini.tsx
"use client";

import { useMemo } from "react";
import { api } from "@/trpc/react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";

type Props = {
  brandId: string;
  brandName: string;
};

export function BrandTrendMini({ brandId, brandName }: Props) {
  const t = useTranslations("benchmark");
  const trend = api.benchmark.getTrend.useQuery(
    { brandId, windowDays: 90 },
    { enabled: Boolean(brandId) },
  );

  const data = useMemo(() => {
    const byDate = new Map<
      string,
      { date: string; pct: number; count: number }
    >();
    for (const r of trend.data ?? []) {
      const date = (r.date as unknown as string).slice(0, 10);
      const cur = byDate.get(date) ?? { date, pct: 0, count: 0 };
      cur.pct += Number(r.mentionPct);
      cur.count += 1;
      byDate.set(date, cur);
    }
    return [...byDate.values()]
      .map((x) => ({
        date: x.date,
        value: x.count > 0 ? x.pct / x.count : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [trend.data]);

  return (
    <Card className="flex flex-col gap-3 p-6">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">
          {t("brandTrendMini.title", { brand: brandName })}
        </h3>
        <span className="text-muted-foreground text-xs">
          {t("brandTrendMini.subtitle")}
        </span>
      </header>
      <div className="h-32">
        {data.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            {t("brandTrendMini.empty")}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={[0, "auto"]} />
              <Tooltip
                formatter={(v) => {
                  if (typeof v === "number") return `${v.toFixed(1)}%`;
                  return v;
                }}
                labelFormatter={(l) => {
                  if (typeof l === "string") return l;
                  return String(l);
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
