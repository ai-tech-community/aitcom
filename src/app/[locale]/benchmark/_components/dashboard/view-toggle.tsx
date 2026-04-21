// src/app/[locale]/benchmark/_components/dashboard/view-toggle.tsx
"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type ChartView = "brands" | "models";

type Props = {
  value: ChartView;
  onChange: (v: ChartView) => void;
  disabledModels?: boolean;
};

export function ViewToggle({ value, onChange, disabledModels }: Props) {
  const t = useTranslations("benchmark.viewToggle");
  return (
    <div
      role="tablist"
      className="bg-muted inline-flex rounded-md p-0.5 text-xs"
    >
      <button
        role="tab"
        type="button"
        aria-selected={value === "brands"}
        onClick={() => onChange("brands")}
        className={cn(
          "rounded px-3 py-1 font-medium transition",
          value === "brands"
            ? "bg-background shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {t("brands")}
      </button>
      <button
        role="tab"
        type="button"
        aria-selected={value === "models"}
        disabled={disabledModels}
        onClick={() => !disabledModels && onChange("models")}
        title={disabledModels ? t("disabledTitle") : undefined}
        className={cn(
          "rounded px-3 py-1 font-medium transition",
          value === "models"
            ? "bg-background shadow-sm"
            : "text-muted-foreground hover:text-foreground",
          disabledModels && "cursor-not-allowed opacity-50",
        )}
      >
        {t("models")}
      </button>
    </div>
  );
}
