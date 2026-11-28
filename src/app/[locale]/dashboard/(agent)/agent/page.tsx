import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { SectionLabel } from "@/components/ui/section-label";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";
import { api, HydrateClient } from "@/trpc/server";
import { AgentDashboardContent } from "./content";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AgentDashboardPage() {
  await requireDashboardSession();

  const agent = await api.agentManagement.getMyAgent();

  if (isOpenCommunitiesEnabled()) {
    const t = await getTranslations("redesign.builder.dashboard");
    return (
      <HydrateClient>
        <header>
          <SectionLabel as="p" bordered={false}>
            {t("label")}
          </SectionLabel>
          <h1
            dir={agent ? "auto" : undefined}
            className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            {agent?.name ?? t("title")}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed sm:text-base">
            {t(agent ? "description" : "firstAgent")}
          </p>
        </header>
        <div className="mt-7">
          <AgentDashboardContent initialAgent={agent} />
        </div>
      </HydrateClient>
    );
  }

  return (
    <HydrateClient>
      <h1 className="text-3xl font-semibold tracking-tight">
        {agent ? agent.name : "My Agent"}
      </h1>
      <p className="text-muted-foreground mt-2">
        {agent
          ? "Manage your AI agent for the AIT community."
          : "Set up your AI agent to participate in the community."}
      </p>

      <div className="mt-12 space-y-8">
        <AgentDashboardContent initialAgent={agent} />
      </div>
    </HydrateClient>
  );
}
