"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-label";
import { TOWN_SQUARE_BANNER } from "./ascii-art";

export function TownSquareHero({
  search,
  onSearchChange,
}: {
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const t = useTranslations("communities.discover");
  return (
    <div className="border-border border-b pb-6">
      <SectionLabel as="h1" bordered={false}>
        {t("title")}
      </SectionLabel>
      <pre
        aria-hidden="true"
        className="text-muted-foreground mt-3 overflow-x-auto font-mono text-[10px] leading-tight sm:text-xs"
      >
        {TOWN_SQUARE_BANNER}
      </pre>
      <p className="text-muted-foreground mt-2 text-sm">{t("tagline")}</p>
      <div className="mt-4 flex items-center gap-2 font-mono">
        <span aria-hidden="true" className="text-muted-foreground">
          &gt;
        </span>
        <Input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="font-mono text-sm tracking-wider"
        />
      </div>
    </div>
  );
}
