"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  StartupsInsightsCategoryRow,
  StartupsInsightsMonthRow,
  StartupsInsightsRegionRow,
  StartupsInsightsSourcesRow,
  StartupsInsightsStageRow,
} from "@/lib/investigations/startups-insights";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

function ChartFrame({
  children,
  label,
  className,
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("h-64 w-full", className)} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function StartupCategoryMixChart({
  data,
  label,
}: {
  data: StartupsInsightsCategoryRow[];
  label: string;
}) {
  return (
    <ChartFrame label={label}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="label"
          width={108}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: "var(--secondary)" }}
          formatter={(value) => [String(value), label]}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((row, index) => (
            <Cell
              key={row.id}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

export function StartupRegionMixChart({
  data,
  label,
}: {
  data: StartupsInsightsRegionRow[];
  label: string;
}) {
  return (
    <ChartFrame label={label}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="region"
          width={148}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: "var(--secondary)" }}
          formatter={(value) => [String(value), label]}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((row, index) => (
            <Cell
              key={row.region}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

export function StartupStageMixChart({
  data,
  label,
}: {
  data: StartupsInsightsStageRow[];
  label: string;
}) {
  const rows = data.map((row) => ({ label: row.stage, count: row.count }));
  return (
    <ChartFrame label={label}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="label"
          width={108}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: "var(--secondary)" }}
          formatter={(value) => [String(value), label]}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {rows.map((row, index) => (
            <Cell
              key={row.label}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

export function StartupSourcesCoverageChart({
  data,
  label,
}: {
  data: StartupsInsightsSourcesRow[];
  label: string;
}) {
  return (
    <ChartFrame label={label}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="label"
          width={108}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: "var(--secondary)" }}
          formatter={(value) => [String(value), label]}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((row, index) => (
            <Cell
              key={row.sources}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

export function StartupAddedOverTimeChart({
  data,
  label,
  className,
}: {
  data: StartupsInsightsMonthRow[];
  label: string;
  className?: string;
}) {
  return (
    <ChartFrame label={label} className={className}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip
          cursor={{ fill: "var(--secondary)" }}
          formatter={(value) => [String(value), label]}
        />
        <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
}
