"use client";

import { StatLabel } from "../../../_components/StatLabel";
import type { BenchmarkStatKey } from "@/lib/benchmark-stat-definitions";

interface MetricSummary {
  visibilityPct: number;
  shareOfVoicePct: number;
  avgPosition: number | null;
  sentimentScore: number;
  sourceVisibilityPct: number;
  citationRatePct: number;
  sampleSize: number;
}

interface MetricCard {
  stat: BenchmarkStatKey;
  value: string;
}

export function MetricCards({ summary }: { summary: MetricSummary }) {
  const cards: MetricCard[] = [
    { stat: "visibility", value: formatPct(summary.visibilityPct) },
    { stat: "shareOfVoice", value: formatPct(summary.shareOfVoicePct) },
    {
      stat: "avgRank",
      value:
        summary.avgPosition === null ? "-" : summary.avgPosition.toFixed(2),
    },
    { stat: "sentiment", value: formatSigned(summary.sentimentScore) },
    { stat: "citationRate", value: formatPct(summary.citationRatePct) },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.stat} className="rounded border p-3">
          <div className="text-muted-foreground text-xs font-medium uppercase">
            <StatLabel stat={card.stat} size="sm" />
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {card.value}
          </div>
          <div className="text-muted-foreground mt-1 text-xs">
            n={summary.sampleSize.toLocaleString()} runs
          </div>
        </div>
      ))}
    </section>
  );
}

function formatPct(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function formatSigned(value: number): string {
  const formatted = `${Math.abs(value).toFixed(value % 1 === 0 ? 0 : 1)}%`;
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}
