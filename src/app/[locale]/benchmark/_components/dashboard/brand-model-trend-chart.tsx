// src/app/[locale]/benchmark/_components/dashboard/brand-model-trend-chart.tsx
"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { colorFor } from "./chart-palette";

export type ModelTrendSeries = {
  modelId: string;
  points: Array<{ date: string; value: number }>;
};

type Props = {
  series: ModelTrendSeries[];
  brandName: string | null;
  isLoading?: boolean;
};

export function BrandModelTrendChart({ series, brandName, isLoading }: Props) {
  const t = useTranslations("benchmark.modelTrend");
  const data = useMemo(() => {
    if (series.length === 0) return [];
    const byDate = new Map<string, Record<string, string | number>>();
    for (const s of series) {
      for (const p of s.points) {
        const row = byDate.get(p.date) ?? { date: p.date };
        row[s.modelId] = p.value;
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

  if (!brandName) {
    return (
      <Card className="flex h-[520px] items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">{t("pickBrand")}</p>
      </Card>
    );
  }

  if (series.length === 0) {
    return (
      <Card className="flex h-[520px] items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">
          {t("emptyForBrand", { brand: brandName })}
        </p>
      </Card>
    );
  }

  return (
    <Card className="h-[520px] p-6">
      <div className="mb-2 text-sm font-medium">
        {t("header", { brand: brandName })}
        <span className="text-muted-foreground ml-2 text-xs font-normal">
          {t("subheader")}
        </span>
      </div>
      <ResponsiveContainer width="100%" height="90%">
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
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          {series.map((s) => (
            <Line
              key={s.modelId}
              type="monotone"
              dataKey={s.modelId}
              name={s.modelId}
              stroke={colorFor(s.modelId)}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
