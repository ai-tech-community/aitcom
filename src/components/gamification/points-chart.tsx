"use client";

import * as React from "react";
import { Star } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

interface PointsChartDataPoint {
  date: string;
  total: number;
  change: number;
}

interface PointsChartLevel {
  value: number;
  color: string;
}

interface PointsChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: PointsChartDataPoint[];
  height?: number;
  title?: string;
  headerRight?: React.ReactNode;
  yAxisLabel?: string;
  levels?: PointsChartLevel[];
  /** Label before the running total in the tooltip (translated by the caller). */
  totalLabel?: string;
  /** Formats a data point's `date` (YYYY-MM-DD) for the axis and tooltip. */
  formatDate?: (date: string) => string;
  /** Width reserved for the Y axis; narrow it in a side panel. */
  yAxisWidth?: number;
}

function formatValue(value: number) {
  return Math.round(value).toLocaleString();
}

function LevelReferenceStarLabel({
  viewBox,
}: {
  viewBox?: { x?: number; y?: number } | null;
}) {
  const x = viewBox?.x;
  const y = viewBox?.y;

  if (typeof x !== "number" || typeof y !== "number") {
    return null;
  }

  return (
    <g transform={`translate(${x - 14},${y})`}>
      <Star
        x={-5}
        y={-5}
        width={10}
        height={10}
        fill="var(--muted-foreground)"
        stroke="var(--muted-foreground)"
        strokeWidth={1.75}
      />
    </g>
  );
}

function PointsChart({
  data,
  height = 260,
  title,
  headerRight,
  yAxisLabel,
  levels,
  totalLabel = "Total",
  formatDate,
  yAxisWidth = 64,
  className,
  ...props
}: PointsChartProps) {
  const yDomain = React.useMemo<[number, number]>(() => {
    const values = [
      ...data.map((item) => item.total),
      ...(levels?.map((level) => level.value) ?? []),
    ];

    if (values.length === 0) return [0, 100];

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue;

    if (range === 0) {
      const padding = Math.max(maxValue * 0.15, 10);
      return [Math.max(0, minValue - padding), maxValue + padding];
    }

    const padding = Math.max(range * 0.12, 10);
    return [Math.max(0, minValue - padding), maxValue + padding];
  }, [data, levels]);

  return (
    <div
      className={cn("bg-card border-border rounded-xl border p-4", className)}
      {...props}
    >
      {title || headerRight ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? (
            <p className="text-md text-foreground font-semibold">{title}</p>
          ) : null}
          {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
        </div>
      ) : null}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 12, right: 12, left: 0, bottom: 4 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={formatDate}
              minTickGap={16}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              domain={yDomain}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={formatValue}
              width={yAxisWidth}
              label={
                yAxisLabel
                  ? {
                      value: yAxisLabel,
                      angle: -90,
                      position: "insideLeft",
                      fill: "var(--muted-foreground)",
                      fontSize: 12,
                      dx: -18,
                    }
                  : undefined
              }
            />
            {levels?.map((level) => (
              <ReferenceLine
                key={level.value}
                y={level.value}
                stroke="var(--border)"
                strokeDasharray="6 6"
                strokeWidth={2}
                label={{
                  position: "left",
                  content: (labelProps: { viewBox?: unknown }) => (
                    <LevelReferenceStarLabel
                      viewBox={
                        (labelProps.viewBox as {
                          x?: number;
                          y?: number;
                        } | null) ?? null
                      }
                    />
                  ),
                }}
              />
            ))}
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as
                  | PointsChartDataPoint
                  | undefined;
                if (!row) return null;
                const changePrefix = row.change > 0 ? "+" : "";
                return (
                  <div className="bg-popover text-popover-foreground border-border rounded-lg border px-3 py-2 text-sm">
                    <p className="text-muted-foreground mb-1 font-mono">
                      {formatDate && typeof label === "string"
                        ? formatDate(label)
                        : label}
                    </p>
                    <p className="font-mono font-medium tabular-nums">
                      {totalLabel} {formatValue(row.total)}
                    </p>
                    <p className="text-muted-foreground font-mono text-xs tabular-nums">
                      {changePrefix}
                      {formatValue(row.change)}
                    </p>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="var(--foreground)"
              strokeWidth={2}
              connectNulls
              dot={{ r: 3, fill: "var(--foreground)" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export { PointsChart };
export type { PointsChartDataPoint, PointsChartProps };
