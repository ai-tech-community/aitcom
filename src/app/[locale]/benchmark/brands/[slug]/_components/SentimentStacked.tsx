"use client";
import { Card } from "@/components/ui/card";

interface Props {
  pos: number;
  neu: number;
  neg: number;
}

export function SentimentStacked({ pos, neu, neg }: Props) {
  const total = pos + neu + neg || 1;
  return (
    <Card className="p-4">
      <div className="flex h-6 overflow-hidden rounded">
        <div
          className="bg-green-500"
          style={{ width: `${(pos / total) * 100}%` }}
          title={`Positive ${pos.toFixed(1)}%`}
        />
        <div
          className="bg-slate-400"
          style={{ width: `${(neu / total) * 100}%` }}
          title={`Neutral ${neu.toFixed(1)}%`}
        />
        <div
          className="bg-red-500"
          style={{ width: `${(neg / total) * 100}%` }}
          title={`Negative ${neg.toFixed(1)}%`}
        />
      </div>
      <div className="text-muted-foreground mt-2 flex justify-between text-xs">
        <span>Positive {pos.toFixed(0)}%</span>
        <span>Neutral {neu.toFixed(0)}%</span>
        <span>Negative {neg.toFixed(0)}%</span>
      </div>
    </Card>
  );
}
