// src/app/[locale]/benchmark/_components/dashboard/model-breakdown.tsx
"use client";

import { useMemo } from "react";
import { api } from "@/trpc/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
  brandId: string;
  brandName: string;
  onClose: () => void;
};

export function ModelBreakdown({ brandId, brandName, onClose }: Props) {
  const t = useTranslations("benchmark");
  const trend = api.benchmark.getTrend.useQuery(
    { brandId, windowDays: 30 },
    { enabled: Boolean(brandId) },
  );

  const perModel = useMemo(() => {
    const rows = trend.data ?? [];
    const byModel = new Map<
      string,
      { totalPct: number; days: number }
    >();
    for (const r of rows) {
      const cur = byModel.get(r.modelId) ?? { totalPct: 0, days: 0 };
      byModel.set(r.modelId, {
        totalPct: cur.totalPct + Number(r.mentionPct),
        days: cur.days + 1,
      });
    }
    const out = [...byModel.entries()].map(([modelId, v]) => ({
      modelId,
      avgPct: v.days > 0 ? v.totalPct / v.days : 0,
    }));
    out.sort((a, b) => b.avgPct - a.avgPct);
    return out;
  }, [trend.data]);

  const max = perModel[0]?.avgPct ?? 0;

  return (
    <Card className="flex flex-col gap-4 p-6 md:p-8">
      <header className="flex items-center justify-between">
        <h3 className="text-lg font-medium">
          {t("modelBreakdown.title", { brand: brandName })}
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </header>

      {trend.isLoading && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-muted h-6 w-full animate-pulse rounded"
            />
          ))}
        </div>
      )}

      {!trend.isLoading && perModel.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {t("modelBreakdown.empty")}
        </p>
      )}

      {perModel.length > 0 && (
        <ul className="flex flex-col gap-2">
          {perModel.map((m) => {
            const width = max > 0 ? (m.avgPct / max) * 100 : 0;
            return (
              <li key={m.modelId} className="flex items-center gap-3">
                <span className="w-32 shrink-0 font-mono text-sm">
                  {m.modelId}
                </span>
                <div className="bg-muted h-2 grow overflow-hidden rounded">
                  <div
                    className="bg-primary h-full"
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-sm tabular-nums">
                  {m.avgPct.toFixed(1)}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
