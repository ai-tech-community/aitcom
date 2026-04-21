"use client";

import { api } from "@/trpc/react";
import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";

import { HeroHeadline } from "./hero-headline";
import { HeroMetrics } from "./hero-metrics";
import { HeroActions } from "./hero-actions";
import { RunnerUpNote } from "./runner-up-note";
import { VerticalPills } from "./vertical-pills";
import type { WindowDays } from "./use-dashboard-query-state";

type Category = {
  id: string;
  slug: string;
  name: string;
};

type Props = {
  categories: Category[];
  activeCategory: Category;
  windowDays: WindowDays;
  modelScope: string;
  onSelectCategory: (slug: string) => void;
  onWindowChange: (w: WindowDays) => void;
  onToggleBrandDetail: () => void;
  getShareUrl: () => string;
};

export function HeroCard({
  categories,
  activeCategory,
  windowDays,
  modelScope,
  onSelectCategory,
  onWindowChange,
  onToggleBrandDetail,
  getShareUrl,
}: Props) {
  const t = useTranslations("benchmark");
  const hero = api.benchmark.getHeroTopBrand.useQuery(
    {
      categoryId: activeCategory.id,
      windowDays,
      modelScope,
    },
    { placeholderData: (prev) => prev },
  );

  return (
    <Card className="flex flex-col gap-6 p-8 md:p-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <VerticalPills
          categories={categories}
          activeSlug={activeCategory.slug}
          onSelect={onSelectCategory}
        />
        <HeroActions
          windowDays={windowDays}
          onWindowChange={onWindowChange}
          getShareUrl={getShareUrl}
        />
      </div>

      {hero.isLoading && <HeroCardSkeleton />}

      {hero.data && (
        <>
          <HeroHeadline
            sharePct={hero.data.sharePct}
            categoryName={activeCategory.name}
            brandName={hero.data.brand.canonicalName}
            onToggleBrandDetail={onToggleBrandDetail}
          />
          <RunnerUpNote
            runnerUp={
              hero.data.runnerUp
                ? {
                    canonicalName: hero.data.runnerUp.canonicalName ?? "",
                    sharePct: hero.data.runnerUp.sharePct,
                  }
                : null
            }
          />
          <HeroMetrics
            totalAnswers={hero.data.totalAnswers}
            modelsSampled={hero.data.modelsSampled}
            windowDays={hero.data.windowDays}
          />
        </>
      )}

      {!hero.isLoading && !hero.data && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <h2 className="text-xl font-medium">
            {t("hero.emptyCategory.heading", {
              category: activeCategory.name,
            })}
          </h2>
          <p className="text-muted-foreground max-w-md">
            {t("hero.emptyCategory.body")}
          </p>
        </div>
      )}
    </Card>
  );
}

function HeroCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3">
      <div className="bg-muted h-20 w-40 rounded md:h-24 md:w-56" />
      <div className="bg-muted h-6 w-2/3 rounded" />
      <div className="bg-muted mt-4 h-14 w-full rounded" />
    </div>
  );
}
