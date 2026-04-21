// src/app/[locale]/benchmark/_components/dashboard-tab.tsx
"use client";

import { useMemo, useState } from "react";
import { api } from "@/trpc/react";

import { DashboardEmpty } from "./dashboard/dashboard-empty";
import { HeroCard } from "./dashboard/hero-card";
import { ModelBreakdown } from "./dashboard/model-breakdown";
import { BrandTrendMini } from "./dashboard/brand-trend-mini";
import { LatestRunsFeedWidget } from "./dashboard/latest-runs-feed";
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
  const { state, update, buildShareUrl } = useDashboardQueryState();
  const categories = api.benchmark.listCategories.useQuery();
  const overview = api.benchmark.getHeroOverview.useQuery({
    windowDays: state.windowDays,
    modelScope: state.modelScope,
  });

  const [breakdownOpen, setBreakdownOpen] = useState(false);

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

  const categoriesLoaded = categories.isFetched;
  const categoriesEmpty = categoriesLoaded && (categories.data ?? []).length === 0;

  if (categoriesEmpty) {
    return (
      <div className="py-4">
        <DashboardEmpty onGoToRun={() => onChangeTab?.("run")} />
      </div>
    );
  }

  if (!activeCategory) {
    return (
      <div className="flex flex-col gap-4 py-4">
        <HeroCardSkeleton />
      </div>
    );
  }

  const heroBrand = hero.data?.brand ?? null;

  return (
    <div className="flex flex-col gap-6 py-4">
      <HeroCard
        categories={categories.data!.map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
        }))}
        activeCategory={{
          id: activeCategory.id,
          slug: activeCategory.slug,
          name: activeCategory.name,
        }}
        windowDays={state.windowDays}
        modelScope={state.modelScope}
        onSelectCategory={(slug) => {
          update({ categorySlug: slug });
          setBreakdownOpen(false);
        }}
        onWindowChange={(w: WindowDays) => update({ windowDays: w })}
        onToggleBrandDetail={() => setBreakdownOpen((v) => !v)}
        getShareUrl={() => buildShareUrl()}
      />

      {breakdownOpen && heroBrand && (
        <ModelBreakdown
          brandId={heroBrand.id}
          brandName={heroBrand.canonicalName}
          onClose={() => setBreakdownOpen(false)}
        />
      )}

      {heroBrand && (
        <div className="grid gap-6 md:grid-cols-2">
          <BrandTrendMini
            brandId={heroBrand.id}
            brandName={heroBrand.canonicalName}
          />
          <LatestRunsFeedWidget />
        </div>
      )}
    </div>
  );
}

function HeroCardSkeleton() {
  return (
    <div className="bg-muted h-64 w-full animate-pulse rounded-lg" />
  );
}
