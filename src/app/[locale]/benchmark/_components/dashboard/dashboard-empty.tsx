// src/app/[locale]/benchmark/_components/dashboard/dashboard-empty.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";

type Props = {
  onGoToRun: () => void;
};

export function DashboardEmpty({ onGoToRun }: Props) {
  const t = useTranslations("benchmark");
  return (
    <Card className="flex flex-col items-center gap-4 p-8 text-center md:p-12">
      <h2 className="text-xl font-medium">{t("dashboardEmpty.heading")}</h2>
      <p className="text-muted-foreground max-w-md">
        {t("dashboardEmpty.body")}
      </p>
      <Button onClick={onGoToRun}>{t("dashboardEmpty.cta")}</Button>
    </Card>
  );
}
