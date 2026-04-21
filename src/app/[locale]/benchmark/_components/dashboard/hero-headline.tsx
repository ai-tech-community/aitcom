// src/app/[locale]/benchmark/_components/dashboard/hero-headline.tsx
"use client";

import { useTranslations } from "next-intl";

type Props = {
  sharePct: number;
  categoryName: string;
  brandName: string;
  onToggleBrandDetail: () => void;
};

export function HeroHeadline({
  sharePct,
  categoryName,
  brandName,
  onToggleBrandDetail,
}: Props) {
  const t = useTranslations("benchmark");
  return (
    <div className="flex flex-col gap-3">
      <div className="text-primary text-6xl font-semibold tabular-nums md:text-7xl">
        {sharePct.toFixed(1)}%
      </div>
      <p className="text-muted-foreground text-lg md:text-xl">
        {t.rich("hero.headline", {
          category: () => (
            <span className="text-foreground font-medium">{categoryName}</span>
          ),
          brand: () => (
            <button
              type="button"
              onClick={onToggleBrandDetail}
              className="text-foreground font-medium underline-offset-4 hover:underline"
            >
              {brandName}
            </button>
          ),
        })}
      </p>
    </div>
  );
}
