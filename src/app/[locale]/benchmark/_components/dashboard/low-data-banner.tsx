"use client";

import { Card } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
  totalAnswers: number;
  threshold?: number;
};

export function LowDataBanner({ totalAnswers, threshold = 5 }: Props) {
  const t = useTranslations("benchmark");
  if (totalAnswers <= 0 || totalAnswers >= threshold) return null;
  return (
    <Card className="bg-muted/40 flex items-start gap-3 border-dashed p-3">
      <AlertTriangle className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-muted-foreground text-sm">
        {t("lowData.body", { count: totalAnswers, threshold })}
      </p>
    </Card>
  );
}
