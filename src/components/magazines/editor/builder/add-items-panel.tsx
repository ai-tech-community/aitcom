"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { SectionLabel } from "@/components/ui/section-label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ADD_TAB_ORDER, BUILDER_ITEM_KINDS } from "./items/registry";
import type { AddPanelProps } from "./items/types";

/**
 * "Add more": one tab per item kind, in `ADD_TAB_ORDER`. The tabs wrap on a
 * narrow screen. Each tab is that kind's own panel; articles already in
 * this issue are not offered again.
 */
export function AddItemsPanel({
  communitySlug,
  referencesInIssue,
  onAdd,
}: AddPanelProps) {
  const t = useTranslations("magazineEditor.builder.add");
  const labelId = useId();

  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-3">
      <SectionLabel id={labelId}>{t("label")}</SectionLabel>
      <Tabs defaultValue="article">
        <TabsList
          aria-label={t("kind")}
          className="h-auto w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto"
        >
          {ADD_TAB_ORDER.map((kind) => (
            <TabsTrigger key={kind} value={kind} className="h-auto flex-none">
              {t(`tabs.${kind}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {ADD_TAB_ORDER.map((kind) => {
          const Panel = BUILDER_ITEM_KINDS[kind].AddPanel;
          return (
            <TabsContent key={kind} value={kind}>
              <Panel
                communitySlug={communitySlug}
                referencesInIssue={referencesInIssue}
                onAdd={onAdd}
              />
            </TabsContent>
          );
        })}
      </Tabs>
    </section>
  );
}
