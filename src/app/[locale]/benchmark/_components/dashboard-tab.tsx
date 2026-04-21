// src/app/[locale]/benchmark/_components/dashboard-tab.tsx
"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

import { DashboardEmpty } from "./dashboard/dashboard-empty";
import { TopSummaryBanner } from "./dashboard/top-summary-banner";
import { WindowSegmented } from "./dashboard/window-segmented";
import { LowDataBanner } from "./dashboard/low-data-banner";
import { BrandRankedList } from "./dashboard/brand-ranked-list";
import { BrandTrendChart } from "./dashboard/brand-trend-chart";
import { BrandModelTrendChart } from "./dashboard/brand-model-trend-chart";
import { BrandModelHeatmap } from "./dashboard/brand-model-heatmap";
import { ViewToggle, type ChartView } from "./dashboard/view-toggle";
import { VerticalPills } from "./dashboard/vertical-pills";
import {
  useDashboardQueryState,
  type WindowDays,
} from "./dashboard/use-dashboard-query-state";
import { resolveDefaultCategory } from "@/server/benchmark/resolve-default-category";

type TabTarget = "dashboard" | "run" | "submit";

type Props = {
  onChangeTab?: (tab: TabTarget) => void;
};

export function DashboardTab({ onChangeTab }: Props) {
  const t = useTranslations("benchmark.dashboard");
  const { state, update } = useDashboardQueryState();
  const categories = api.benchmark.listCategories.useQuery();
  const overview = api.benchmark.getHeroOverview.useQuery({
    windowDays: state.windowDays,
    modelScope: state.modelScope,
  });

  const activeCategory = useMemo(() => {
    if (!categories.data || categories.data.length === 0) return null;
    if (state.categorySlug) {
      const hit = categories.data.find((c) => c.slug === state.categorySlug);
      if (hit) return hit;
    }
    return resolveDefaultCategory(
      categories.data.map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
      (overview.data ?? []).map((r) => ({
        categoryId: r.categoryId,
        sharePct: r.sharePct,
      })),
    );
  }, [categories.data, overview.data, state.categorySlug]);

  const hero = api.benchmark.getHeroTopBrand.useQuery(
    {
      categoryId: activeCategory?.id ?? "",
      windowDays: state.windowDays,
      modelScope: state.modelScope,
    },
    { enabled: Boolean(activeCategory?.id) },
  );

  const list = api.benchmark.getCategoryBrandList.useQuery(
    {
      categoryId: activeCategory?.id ?? "",
      windowDays: state.windowDays,
    },
    {
      enabled: Boolean(activeCategory?.id),
      placeholderData: (prev) => prev,
    },
  );

  const trend = api.benchmark.getCategoryBrandTrend.useQuery(
    {
      categoryId: activeCategory?.id ?? "",
      windowDays: state.windowDays,
    },
    {
      enabled: Boolean(activeCategory?.id),
      placeholderData: (prev) => prev,
    },
  );

  const matrix = api.benchmark.getCategoryBrandModelMatrix.useQuery(
    {
      categoryId: activeCategory?.id ?? "",
      windowDays: state.windowDays,
      topBrands: 10,
    },
    {
      enabled: Boolean(activeCategory?.id),
      placeholderData: (prev) => prev,
    },
  );

  const [chartView, setChartView] = useState<ChartView>("brands");
  const modelTrend = api.benchmark.getBrandModelTrend.useQuery(
    {
      categoryId: activeCategory?.id ?? "",
      brandSlug: state.activeBrandSlug ?? "",
      windowDays: state.windowDays,
    },
    {
      enabled: Boolean(activeCategory?.id && state.activeBrandSlug),
      placeholderData: (prev) => prev,
    },
  );

  const activeBrandName = useMemo(() => {
    if (!state.activeBrandSlug) return null;
    return (
      list.data?.brands.find((b) => b.slug === state.activeBrandSlug)
        ?.canonicalName ?? null
    );
  }, [list.data?.brands, state.activeBrandSlug]);

  const categoriesLoaded = categories.isFetched;
  const categoriesEmpty =
    categoriesLoaded && (categories.data ?? []).length === 0;

  if (categoriesEmpty) {
    return (
      <div className="py-4">
        <DashboardEmpty onGoToRun={() => onChangeTab?.("run")} />
      </div>
    );
  }

  const onToggleBrand = (slug: string) => {
    update({
      activeBrandSlug: state.activeBrandSlug === slug ? null : slug,
    });
  };

  return (
    <div className="flex flex-col gap-4 py-4">
      {categories.data && (
        <VerticalPills
          categories={categories.data.map((c) => ({
            id: c.id,
            slug: c.slug,
            name: c.name,
          }))}
          activeSlug={activeCategory?.slug ?? null}
          onSelect={(slug) =>
            update({ categorySlug: slug, activeBrandSlug: null })
          }
        />
      )}

      <div className="flex justify-end">
        <WindowSegmented
          value={state.windowDays}
          onChange={(w: WindowDays) => update({ windowDays: w })}
        />
      </div>

      {activeCategory && hero.data && !list.data?.lowData && (
        <TopSummaryBanner
          categoryName={activeCategory.name}
          brandName={hero.data.brand.canonicalName}
          sharePct={hero.data.sharePct}
        />
      )}

      {list.data && <LowDataBanner totalAnswers={list.data.totalAnswers} />}

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("sectionHeader")}</h2>
        <p className="text-muted-foreground text-xs">{t("metricHelp")}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(320px,1fr)_2fr]">
        <BrandRankedList
          brands={list.data?.brands ?? []}
          totalAnswers={list.data?.totalAnswers ?? 0}
          activeBrandSlug={state.activeBrandSlug}
          onToggleBrand={onToggleBrand}
          isLoading={list.isLoading}
        />
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-end">
            <ViewToggle
              value={chartView}
              onChange={setChartView}
              disabledModels={!state.activeBrandSlug}
            />
          </div>
          {chartView === "brands" ? (
            <BrandTrendChart
              series={trend.data?.series ?? []}
              activeBrandSlug={state.activeBrandSlug}
              isLoading={trend.isLoading}
            />
          ) : (
            <BrandModelTrendChart
              series={modelTrend.data?.series ?? []}
              brandName={activeBrandName}
              isLoading={modelTrend.isLoading}
            />
          )}
        </div>
      </div>

      {activeCategory && (
        <BrandModelHeatmap
          models={matrix.data?.models ?? []}
          brands={matrix.data?.brands ?? []}
          activeBrandSlug={state.activeBrandSlug}
          onToggleBrand={onToggleBrand}
          isLoading={matrix.isLoading}
        />
      )}
    </div>
  );
}
