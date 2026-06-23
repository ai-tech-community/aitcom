"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Facet } from "./discover-communities";

const FACETS: Facet[] = ["trending", "newest", "largest"];

export function DiscoverFacets({
  value,
  onChange,
  disabled,
}: {
  value: Facet;
  onChange: (f: Facet) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("communities.discover");
  const label: Record<Facet, string> = {
    trending: t("facetTrending"),
    newest: t("facetNewest"),
    largest: t("facetLargest"),
  };
  return (
    <div role="tablist" aria-label={t("communities")} className="flex items-center gap-4">
      {FACETS.map((f) => {
        const active = value === f;
        return (
          <button
            key={f}
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(f)}
            className={cn(
              "font-mono text-xs tracking-wider uppercase transition-colors disabled:opacity-50",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? "[ " : ""}
            {label[f]}
            {active ? " ]" : ""}
          </button>
        );
      })}
    </div>
  );
}
