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
  AwesomeInsightsCategoryRow,
  AwesomeInsightsHostRow,
  AwesomeInsightsMonthRow,
  AwesomeInsightsStarBucketRow,
  AwesomeInsightsTopStarRow,
} from "@/lib/investigations/awesome-ai-oss-insights";

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
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="h-64 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function AwesomeCategoryMixChart({
  data,
  label,
}: {
  data: AwesomeInsightsCategoryRow[];
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
              key={row.id}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

export function AwesomeHostMixChart({
  data,
  label,
}: {
  data: AwesomeInsightsHostRow[];
  label: string;
}) {
  return (
    <ChartFrame label={label}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip
          cursor={{ fill: "var(--secondary)" }}
          formatter={(value) => [String(value), label]}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((row, index) => (
            <Cell
              key={row.host}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

export function AwesomeAddedOverTimeChart({
  data,
  label,
}: {
  data: AwesomeInsightsMonthRow[];
  label: string;
}) {
  return (
    <ChartFrame label={label}>
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

export function AwesomeStarDistributionChart({
  data,
  label,
}: {
  data: AwesomeInsightsStarBucketRow[];
  label: string;
}) {
  return (
    <ChartFrame label={label}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip
          cursor={{ fill: "var(--secondary)" }}
          formatter={(value) => [String(value), label]}
        />
        <Bar dataKey="count" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
}

export function AwesomeTopLiveStarsChart({
  data,
  label,
}: {
  data: AwesomeInsightsTopStarRow[];
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
          dataKey="name"
          width={168}
          tick={{ fontSize: 11 }}
        />
        <Tooltip
          cursor={{ fill: "var(--secondary)" }}
          formatter={(value) => [String(value), label]}
        />
        <Bar dataKey="starCount" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartFrame>
  );
}
