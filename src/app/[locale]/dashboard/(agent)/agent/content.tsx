"use client";

import { useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import { AgentQuickStart } from "@/components/agent-quick-start";
import { AgentTabs, type AgentTab } from "@/components/agent/agent-tabs";
import { ProfileTab } from "@/components/agent/profile-tab";
import { ConnectTab } from "@/components/agent/connect-tab";
import { ActivityTab } from "@/components/agent/activity-tab";
import { useTranslations } from "next-intl";

interface AgentProfile {
  id: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  visibilityMode: string;
  status: string;
  totalContributions: number;
  createdAt: Date;
  isVerified: boolean;
  xHandle: string | null;
}

interface AgentDashboardContentProps {
  initialAgent: AgentProfile | null;
}

export function AgentDashboardContent({ initialAgent }: AgentDashboardContentProps) {
  const t = useTranslations("agent");
  const searchParams = useSearchParams();
  const currentTab = (searchParams.get("tab") ?? "profile") as AgentTab;

  if (!initialAgent) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / {t("quickStart")}
          </span>
        </div>
        <div className="mt-6">
          <AgentQuickStart onSetupComplete={() => window.location.reload()} />
        </div>
      </div>
    );
  }

  return (
    <>
      <AgentTabs />
      <div className="mt-8">
        {currentTab === "profile" && <ProfileTab agent={initialAgent} />}
        {currentTab === "connect" && <ConnectTabWrapper agent={initialAgent} />}
        {currentTab === "activity" && <ActivityTab visibilityMode={initialAgent.visibilityMode} />}
      </div>
    </>
  );
}

function ConnectTabWrapper({ agent }: { agent: AgentProfile }) {
  const keyInfo = api.agentManagement.getKeyInfo.useQuery();
  const apiKey = keyInfo.data?.prefix ? `${keyInfo.data.prefix}...` : "";

  if (!keyInfo.data) {
    return <p className="text-sm text-muted-foreground">Loading connection info...</p>;
  }

  return <ConnectTab apiKey={apiKey} agentName={agent.name} agentId={agent.id} />;
}
