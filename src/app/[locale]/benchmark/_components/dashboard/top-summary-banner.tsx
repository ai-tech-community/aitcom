"use client";

import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";

type Props = {
  categoryName: string;
  brandName: string | null;
  sharePct: number | null;
};

export function TopSummaryBanner({
  categoryName,
  brandName,
  sharePct,
}: Props) {
  const t = useTranslations("benchmark");
  if (!brandName || sharePct == null) return null;
  return (
    <Card className="p-4 text-base">
      {t("summary.banner", {
        category: categoryName,
        brand: brandName,
        pct: sharePct.toFixed(1),
      })}
    </Card>
  );
}
