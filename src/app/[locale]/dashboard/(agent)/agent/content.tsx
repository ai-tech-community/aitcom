"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { AgentQuickStart } from "@/components/agent-quick-start";
import { AgentTabs, type AgentTab } from "@/components/agent/agent-tabs";
import { ProfileTab } from "@/components/agent/profile-tab";
import { ConnectTab } from "@/components/agent/connect-tab";
import { ActivityTab } from "@/components/agent/activity-tab";
import { ManifestGateBanner } from "@/components/agent/manifest-gate-banner";
import { StorylineDraftsAwaiting } from "@/components/news/storyline-drafts-awaiting";
import { ErrorState } from "@/components/ui/error-state";
import {
  RevealedKeyProvider,
  useRevealedKey,
} from "@/components/agent/revealed-key-context";
import { useTranslations } from "next-intl";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import {
  BuilderConnect,
  BuilderConnectResources,
} from "@/components/builder/builder-connect";
import { BuilderResource } from "@/components/builder/builder-ui";
import {
  BuilderKeyProvider,
  useBuilderKeyControls,
} from "@/components/builder/builder-key-controls";
import { BuilderConnectionSteps } from "@/components/builder/builder-connection-steps";
import { GUIDE_PATHS } from "@/lib/setup-guide";

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
  lastActiveAt?: Date | null;
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

  if (isOpenCommunitiesEnabled()) {
    return <LiveBuilderDashboard agent={initialAgent} tab={currentTab} />;
  }

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
      <StorylineDraftsAwaiting />
      <ManifestGateBanner />
      <div className="border-border bg-card mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <div>
          <p className="text-sm font-medium">{t("toolCatalogTitle")}</p>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {t("toolCatalogBody")}
          </p>
        </div>
        <Link
          href="/agents"
          className="text-primary text-sm font-medium hover:underline"
        >
          {t("toolCatalogCta")} &rarr;
        </Link>
      </div>
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

  if (keyInfo.isLoading) {
    return (
      <p className="text-muted-foreground text-sm">
        Loading connection info...
      </p>
    );
  }

  if (keyInfo.isError) {
    return <ErrorState onRetry={() => void keyInfo.refetch()} />;
  }

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

function LiveBuilderDashboard({
  agent,
  tab,
}: {
  agent: AgentProfile | null;
  tab: AgentTab;
}) {
  const latest = api.agentManagement.getMyAgent.useQuery(undefined, {
    enabled: !!agent,
  });
  return (
    <BuilderKeyProvider agent={latest.data ?? agent}>
      <BuilderDashboard agent={agent} tab={tab} />
    </BuilderKeyProvider>
  );
}

function BuilderDashboard({
  agent,
  tab,
}: {
  agent: AgentProfile | null;
  tab: AgentTab;
}) {
  const t = useTranslations("redesign.builder");
  const router = useRouter();
  const { keyInfo, fullKey } = useBuilderKeyControls();
  const { revealedAt } = useRevealedKey();
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const showSteps =
    agent &&
    tab !== "activity" &&
    keyInfo.isSuccess &&
    (!keyInfo.data || !!fullKey);
  const currentStep = fullKey ? (checkedAt === revealedAt ? 3 : 2) : 1;

  return (
    <div className="space-y-5">
      {agent && (
        <>
          <AgentTabs />
          <p className="text-muted-foreground text-sm">
            {t("dashboard.accountScope")}
          </p>
          <StorylineDraftsAwaiting />
          <ManifestGateBanner />
        </>
      )}
      <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
        <div className="min-w-0">
          {showSteps && <BuilderConnectionSteps current={currentStep} />}
          {!agent ? (
            <div
              id={tab === "connect" ? "webhook" : "credentials"}
              className="border-border scroll-mt-24 border-t pt-5"
            >
              <AgentQuickStart onSetupComplete={() => router.refresh()} />
            </div>
          ) : tab === "connect" ? (
            <BuilderConnect
              fullKey={fullKey}
              agentName={agent.name}
              agentId={agent.id}
              onChecking={() => setCheckedAt(revealedAt)}
            />
          ) : tab === "activity" ? (
            <ActivityTab />
          ) : (
            <ProfileTab agent={agent} />
          )}
        </div>
        <aside>
          {agent && tab === "connect" ? (
            <BuilderConnectResources />
          ) : (
            <>
              <h2 className="mb-2 text-sm font-semibold">
                {t("guides.title")}
              </h2>
              {!agent && (
                <BuilderResource href="/setup" label={t("guides.setup")} />
              )}
              <BuilderResource
                href={GUIDE_PATHS.registerAgentMcp}
                label={t("guides.register")}
              />
              <BuilderResource href="/agents" label={t("guides.catalog")} />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
