// src/app/[locale]/benchmark/_components/dashboard/brand-model-heatmap.tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type HeatmapModel = {
  modelId: string;
  modelProvider: string;
  totalRuns: number;
};

export type HeatmapCell = {
  modelId: string;
  mentions: number;
  totalRuns: number;
  sharePct: number;
};

export type HeatmapBrand = {
  brandId: string;
  slug: string;
  canonicalName: string;
  totalMentions: number;
  cells: HeatmapCell[];
};

type Props = {
  models: HeatmapModel[];
  brands: HeatmapBrand[];
  activeBrandSlug: string | null;
  onToggleBrand: (slug: string) => void;
  isLoading?: boolean;
};

// Tailwind-safe orange scale — keyed by bucket so classes aren't
// purged. Picks a step based on sharePct (0..100).
const BG_STEPS = [
  "bg-transparent",
  "bg-orange-50",
  "bg-orange-100",
  "bg-orange-200",
  "bg-orange-300",
  "bg-orange-400 text-white",
  "bg-orange-500 text-white",
  "bg-orange-600 text-white",
];

function cellClass(sharePct: number, hasData: boolean): string {
  if (!hasData) return "bg-muted/30 text-muted-foreground";
  if (sharePct <= 0) return BG_STEPS[0]!;
  const idx = Math.min(
    BG_STEPS.length - 1,
    Math.max(1, Math.ceil((sharePct / 100) * (BG_STEPS.length - 1))),
  );
  return BG_STEPS[idx]!;
}

export function BrandModelHeatmap({
  models,
  brands,
  activeBrandSlug,
  onToggleBrand,
  isLoading,
}: Props) {
  const t = useTranslations("benchmark.heatmap");
  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="bg-muted/50 h-40 w-full animate-pulse rounded" />
      </Card>
    );
  }

  if (models.length === 0 || brands.length === 0) {
    return (
      <Card className="flex items-center justify-center p-8">
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-medium">{t("title")}</h3>
        <p className="text-muted-foreground text-xs">{t("subtitle")}</p>
      </div>
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="bg-background text-muted-foreground sticky left-0 z-10 min-w-[160px] px-2 py-1 text-left text-xs font-medium">
              {t("brandHeader")}
            </th>
            {models.map((m) => (
              <th
                key={m.modelId}
                className="text-muted-foreground px-2 py-1 text-center text-xs font-medium whitespace-nowrap"
                title={`${m.modelProvider} • ${t("runsSuffix", { n: m.totalRuns })}`}
              >
                <div className="font-mono text-[11px] normal-case">
                  {m.modelId}
                </div>
                <div className="text-[10px] opacity-70">
                  {t("runsSuffix", { n: m.totalRuns })}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {brands.map((b) => {
            const active = b.slug === activeBrandSlug;
            return (
              <tr key={b.brandId}>
                <th
                  scope="row"
                  className={cn(
                    "bg-background sticky left-0 z-10 px-2 py-1 text-left font-medium whitespace-nowrap",
                    active && "bg-primary/10",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onToggleBrand(b.slug)}
                    className="hover:underline"
                  >
                    {b.canonicalName}
                  </button>
                  <Link
                    href={`/benchmark/brands/${b.slug}`}
                    className="text-muted-foreground ml-2 text-[10px] hover:underline"
                  >
                    {t("detailsLink")}
                  </Link>
                </th>
                {b.cells.map((c) => {
                  const hasData = c.totalRuns > 0;
                  return (
                    <td
                      key={c.modelId}
                      className={cn(
                        "border-background border px-2 py-1 text-center font-mono text-xs tabular-nums",
                        cellClass(c.sharePct, hasData),
                        active && "ring-primary/40 ring-2 ring-inset",
                      )}
                      title={
                        hasData
                          ? t("cellTitle", {
                              mentions: c.mentions,
                              total: c.totalRuns,
                              pct: c.sharePct.toFixed(1),
                            })
                          : t("cellEmpty")
                      }
                    >
                      {hasData ? `${c.sharePct.toFixed(0)}%` : t("noData")}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
