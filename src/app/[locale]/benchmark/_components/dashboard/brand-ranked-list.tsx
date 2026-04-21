// src/app/[locale]/benchmark/_components/dashboard/brand-ranked-list.tsx
"use client";

import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { RankedBrandRow, type RankedBrand } from "./ranked-brand-row";

type Props = {
  brands: RankedBrand[];
  totalAnswers: number;
  activeBrandSlug: string | null;
  onToggleBrand: (slug: string) => void;
  isLoading?: boolean;
};

export function BrandRankedList({
  brands,
  totalAnswers,
  activeBrandSlug,
  onToggleBrand,
  isLoading,
}: Props) {
  const t = useTranslations("benchmark");

  if (isLoading) {
    return (
      <Card className="flex max-h-[520px] flex-col divide-y overflow-y-auto">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="bg-muted/50 h-12 w-full animate-pulse"
            aria-hidden
          />
        ))}
      </Card>
    );
  }

  if (brands.length === 0) {
    return (
      <Card className="flex max-h-[520px] items-center justify-center p-8">
        <p className="text-muted-foreground text-sm">{t("list.empty")}</p>
      </Card>
    );
  }

  return (
    <Card className="flex max-h-[520px] flex-col divide-y overflow-y-auto">
      {brands.map((b) => (
        <RankedBrandRow
          key={b.brandId}
          brand={b}
          active={b.slug === activeBrandSlug}
          totalAnswers={totalAnswers}
          onToggle={onToggleBrand}
        />
      ))}
    </Card>
  );
}
