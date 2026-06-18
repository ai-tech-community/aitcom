// src/app/[locale]/benchmark/_components/dashboard/ranked-brand-row.tsx
"use client";

import Link from "next/link";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { colorFor } from "./chart-palette";

type SparklinePoint = { date: string; value: number };

export type RankedBrand = {
  brandId: string;
  slug: string;
  canonicalName: string;
  sharePct: number;
  mentionCount: number;
  rank: number;
  sparkline: SparklinePoint[];
};

type Props = {
  brand: RankedBrand;
  active: boolean;
  totalAnswers: number;
  onToggle: (slug: string) => void;
};

export function RankedBrandRow({
  brand,
  active,
  totalAnswers,
  onToggle,
}: Props) {
  const color = colorFor(brand.slug);
  return (
    <button
      type="button"
      onClick={() => onToggle(brand.slug)}
      className={cn(
        "hover:bg-muted/40 flex w-full items-center gap-3 p-3 text-left transition",
        active && "bg-primary/10",
      )}
    >
      <span className="text-muted-foreground w-8 text-sm tabular-nums">
        #{brand.rank}
      </span>
      <Link
        href={`/benchmark/brands/${brand.slug}`}
        onClick={(e) => e.stopPropagation()}
        className="grow truncate font-medium underline-offset-4 hover:underline"
      >
        {brand.canonicalName}
      </Link>
      <span className="flex flex-col items-end text-sm tabular-nums">
        <span>{brand.sharePct.toFixed(0)}%</span>
        <span className="text-muted-foreground text-xs">
          {brand.mentionCount}/{totalAnswers}
        </span>
      </span>
      <div className="h-8 w-20">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={brand.sparkline}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </button>
  );
}
