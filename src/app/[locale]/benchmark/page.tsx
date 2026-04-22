// src/app/[locale]/benchmark/page.tsx
"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmitPromptTab } from "./_components/submit-prompt-tab";
import { RunPromptsTab } from "./_components/run-prompts-tab";
import { DashboardTab } from "./_components/dashboard-tab";
import { BrandSearchCombobox } from "./brands/_components/BrandSearchCombobox";
import { useTranslations } from "next-intl";

const VALID_TABS = ["dashboard", "run", "submit"] as const;
type Tab = (typeof VALID_TABS)[number];

function coerceTab(raw: string | null): Tab {
  return (VALID_TABS as readonly string[]).includes(raw ?? "")
    ? (raw as Tab)
    : "dashboard";
}

export default function BenchmarkPage() {
  const t = useTranslations("benchmark");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = coerceTab(params.get("tab"));

  const setTab = useCallback(
    (next: Tab) => {
      const q = new URLSearchParams(params.toString());
      if (next === "dashboard") q.delete("tab");
      else q.set("tab", next);
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">{t("pageTitle")}</h1>
          <p className="text-muted-foreground">{t("pageTagline")}</p>
        </div>
        <BrandSearchCombobox />
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(coerceTab(v))}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="dashboard">{t("tabs.dashboard")}</TabsTrigger>
          <TabsTrigger value="run">{t("tabs.run")}</TabsTrigger>
          <TabsTrigger value="submit">{t("tabs.submit")}</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard">
          <DashboardTab onChangeTab={setTab} />
        </TabsContent>
        <TabsContent value="run">
          <RunPromptsTab />
        </TabsContent>
        <TabsContent value="submit">
          <SubmitPromptTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}
