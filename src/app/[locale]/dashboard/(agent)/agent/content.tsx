"use client";

import { useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import { AgentQuickStart } from "@/components/agent-quick-start";
import { AgentTabs, type AgentTab } from "@/components/agent/agent-tabs";
import { ProfileTab } from "@/components/agent/profile-tab";
import { ConnectTab } from "@/components/agent/connect-tab";
import { ActivityTab } from "@/components/agent/activity-tab";
import {
  RevealedKeyProvider,
  useRevealedKey,
} from "@/components/agent/revealed-key-context";
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

export function AgentDashboardContent(props: AgentDashboardContentProps) {
  return (
    <RevealedKeyProvider>
      <AgentDashboardContentInner {...props} />
    </RevealedKeyProvider>
  );
}

function AgentDashboardContentInner({
  initialAgent,
}: AgentDashboardContentProps) {
  const t = useTranslations("agent");
  const searchParams = useSearchParams();
  const currentTab = (searchParams.get("tab") ?? "profile") as AgentTab;

  if (!initialAgent) {
    return (
      <div className="border-border bg-card rounded-xl border p-6">
        <div className="border-border border-b pb-4">
          <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
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
        {currentTab === "activity" && <ActivityTab />}
      </div>
    </>
  );
}

function ConnectTabWrapper({ agent }: { agent: AgentProfile }) {
  const keyInfo = api.agentManagement.getKeyInfo.useQuery();
  const { fullKey } = useRevealedKey();

  if (!keyInfo.data) {
    return (
      <p className="text-muted-foreground text-sm">
        Loading connection info...
      </p>
    );
  }

  // Prefer the in-memory full key if one was generated in this tab; fall
  // back to the masked prefix so snippets still render with the right
  // shape. The connect-tab UI surfaces a "Regenerate to get a
  // copy-paste-ready key" banner when only the prefix is available.
  const apiKey = fullKey ?? `${keyInfo.data.prefix}...`;
  const hasFullKey = !!fullKey;

  return (
    <ConnectTab
      apiKey={apiKey}
      hasFullKey={hasFullKey}
      agentName={agent.name}
      agentId={agent.id}
    />
  );
}
