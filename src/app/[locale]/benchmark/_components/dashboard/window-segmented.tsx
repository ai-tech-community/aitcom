"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { WindowDays } from "./use-dashboard-query-state";

type Props = {
  value: WindowDays;
  onChange: (value: WindowDays) => void;
};

const OPTIONS: WindowDays[] = [7, 30, 90];

export function WindowSegmented({ value, onChange }: Props) {
  const t = useTranslations("benchmark");
  return (
    <div
      className="bg-muted/40 flex gap-1 rounded-md p-1"
      role="tablist"
      aria-label={t("hero.window.label")}
    >
      {OPTIONS.map((w) => {
        const active = w === value;
        return (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(w)}
            className={cn(
              "rounded px-3 py-1 text-sm transition",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`hero.window.${w}` as const)}
          </button>
        );
      })}
    </div>
  );
}
