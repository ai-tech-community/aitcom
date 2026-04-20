import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmitPromptTab } from "./_components/submit-prompt-tab";
import { RunPromptsTab } from "./_components/run-prompts-tab";
import { DashboardTab } from "./_components/dashboard-tab";

export default function BenchmarkPage() {
  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">AI Brand Bias Benchmark</h1>
        <p className="text-muted-foreground">
          Community-curated prompts, community-run models, shared brand trends.
        </p>
      </header>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="run">Run Prompts</TabsTrigger>
          <TabsTrigger value="submit">Submit Prompt</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><DashboardTab /></TabsContent>
        <TabsContent value="run"><RunPromptsTab /></TabsContent>
        <TabsContent value="submit"><SubmitPromptTab /></TabsContent>
      </Tabs>
    </main>
  );
}
