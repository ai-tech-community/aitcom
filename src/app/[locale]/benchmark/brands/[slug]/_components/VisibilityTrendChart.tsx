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

interface DayRow {
  date: string;
  modelId: string;
  mentionsCount: number;
  runsTotal: number;
}

interface Props {
  rows: DayRow[];
  windowDays: 7 | 30 | 90;
  activeModelId: string | null;
}

export function VisibilityTrendChart({
  rows,
  windowDays,
  activeModelId,
}: Props) {
  const data = useMemo(() => {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const byDate = new Map<string, { mentions: number; runs: number }>();
    for (const r of rows) {
      if (new Date(r.date).getTime() < cutoff) continue;
      if (activeModelId && r.modelId !== activeModelId) continue;
      const cur = byDate.get(r.date) ?? { mentions: 0, runs: 0 };
      cur.mentions += r.mentionsCount;
      cur.runs += r.runsTotal;
      byDate.set(r.date, cur);
    }
    return [...byDate.entries()]
      .map(([date, v]) => ({
        date,
        value: v.runs === 0 ? 0 : (v.mentions / v.runs) * 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [rows, windowDays, activeModelId]);

  return (
    <Card className="h-64 p-4">
      {data.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-muted-foreground text-sm">No trend data yet.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => d.slice(5)}
              fontSize={11}
            />
            <YAxis
              tickFormatter={(v: number) => `${Math.round(v)}%`}
              fontSize={11}
              domain={[0, "auto"]}
            />
            <Tooltip
              formatter={(v: unknown) =>
                typeof v === "number" ? `${v.toFixed(1)}%` : ""
              }
            />
            <Line
              type="monotone"
              dataKey="value"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
