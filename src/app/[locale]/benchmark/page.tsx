// src/app/[locale]/benchmark/page.tsx
"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmitPromptTab } from "./_components/submit-prompt-tab";
import { RunPromptsTab } from "./_components/run-prompts-tab";
import { DashboardTab } from "./_components/dashboard-tab";
import { useTranslations } from "next-intl";

export default function BenchmarkPage() {
  const t = useTranslations("benchmark");
  const [tab, setTab] = useState<"dashboard" | "run" | "submit">("dashboard");

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{t("pageTitle")}</h1>
        <p className="text-muted-foreground">{t("pageTagline")}</p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
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
