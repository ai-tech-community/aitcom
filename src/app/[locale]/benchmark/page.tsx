import { getTranslations } from "next-intl/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmitPromptTab } from "./_components/submit-prompt-tab";
import { RunPromptsTab } from "./_components/run-prompts-tab";
import { DashboardTab } from "./_components/dashboard-tab";

export default async function BenchmarkPage() {
  const t = await getTranslations("benchmark");

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{t("pageTitle")}</h1>
        <p className="text-muted-foreground">{t("pageSubtitle")}</p>
      </header>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList>
          <TabsTrigger value="dashboard">{t("tabs.dashboard")}</TabsTrigger>
          <TabsTrigger value="run">{t("tabs.run")}</TabsTrigger>
          <TabsTrigger value="submit">{t("tabs.submit")}</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard">
          <DashboardTab />
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
