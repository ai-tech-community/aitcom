"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { colorFor } from "./chart-palette";

export type TrendSeries = {
  brandId: string;
  slug: string;
  canonicalName: string;
  points: Array<{ date: string; value: number }>;
};

type Props = {
  series: TrendSeries[];
  activeBrandSlug: string | null;
  isLoading?: boolean;
};

export function BrandTrendChart({ series, activeBrandSlug, isLoading }: Props) {
  const t = useTranslations("benchmark");

  const data = useMemo(() => {
    if (series.length === 0) return [];
    const byDate = new Map<string, Record<string, string | number>>();
    for (const s of series) {
      for (const p of s.points) {
        const row = byDate.get(p.date) ?? { date: p.date };
        row[s.slug] = p.value;
        byDate.set(p.date, row);
      }
    }
    return [...byDate.values()].sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
  }, [series]);

  if (isLoading) {
    return (
      <Card className="h-[520px] p-6">
        <div className="bg-muted/50 h-full w-full animate-pulse rounded" />
      </Card>
    );
  }

  if (series.length === 0) {
    return (
      <Card className="flex h-[520px] items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">{t("chart.empty")}</p>
      </Card>
    );
  }

  return (
    <Card className="h-[520px] p-6">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            fontSize={11}
          />
          <YAxis
            domain={[0, "auto"]}
            tickFormatter={(v: number) => `${Math.round(v)}%`}
            fontSize={11}
          />
          <Tooltip
            formatter={(v: unknown) =>
              typeof v === "number" ? `${v.toFixed(1)}%` : ""
            }
            labelFormatter={(l: unknown) =>
              typeof l === "string" ? l : typeof l === "number" ? String(l) : ""
            }
            contentStyle={{
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              border: "1px solid #ccc",
              borderRadius: "4px",
              padding: "8px",
            }}
          />
          {series.map((s) => (
            <Line
              key={s.slug}
              type="monotone"
              dataKey={s.slug}
              stroke={colorFor(s.slug)}
              strokeWidth={s.slug === activeBrandSlug ? 3 : 1}
              strokeOpacity={
                activeBrandSlug === null
                  ? 0.8
                  : s.slug === activeBrandSlug
                    ? 1
                    : 0.2
              }
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
