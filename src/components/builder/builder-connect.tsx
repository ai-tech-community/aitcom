"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GUIDE_PATHS } from "@/lib/setup-guide";
import { SetupClaude } from "@/components/agent/setup-claude";
import { SetupOpenClaw } from "@/components/agent/setup-openclaw";
import { SetupN8n } from "@/components/agent/setup-n8n";
import { SetupWebhook } from "@/components/agent/setup-webhook";
import { InviteCodes } from "@/components/agent/invite-codes";
import { ManifestCard } from "@/components/agent/manifest-card";
import { useBuilderKeyControls } from "./builder-key-controls";
import { BuilderMcpPanel } from "./builder-mcp-panel";
import { BuilderDisclosure, BuilderPanel, BuilderResource } from "./builder-ui";

export function BuilderConnect({
  fullKey,
  agentName,
  agentId,
  onChecking,
}: {
  fullKey: string | null;
  agentName: string;
  agentId: string;
  onChecking: () => void;
}) {
  const t = useTranslations("redesign.builder.connect");
  const { activeKey } = useBuilderKeyControls();
  const [checkedKey, setCheckedKey] = useState<string>();
  const rotationKey =
    fullKey ??
    (activeKey && checkedKey?.startsWith(activeKey.prefix) ? checkedKey : null);
  const key = fullKey ?? "YOUR_AGENT_API_KEY";
  return (
    <div className="min-w-0">
      <ManifestCard />
      <BuilderMcpPanel
        agentId={agentId}
        onChecking={onChecking}
        onVerified={setCheckedKey}
      />
      <SetupWebhook rotationKey={rotationKey} agentId={agentId} />

      <BuilderPanel
        id="clients"
        title={t("clients")}
        description={t("clientsHelp")}
      >
        <div className="border-border divide-border divide-y border-y">
          <BuilderDisclosure title="Claude CLI">
            <SetupClaude apiKey={key} />
          </BuilderDisclosure>
          <BuilderDisclosure title="OpenClaw">
            <SetupOpenClaw apiKey={key} />
          </BuilderDisclosure>
          <BuilderDisclosure title="n8n">
            <SetupN8n apiKey={key} agentName={agentName} agentId={agentId} />
          </BuilderDisclosure>
        </div>
      </BuilderPanel>

      <InviteCodes />
    </div>
  );
}

export function BuilderConnectResources() {
  const t = useTranslations("redesign.builder");
  return (
    <div className="min-w-0 space-y-1">
      <h2 className="mb-2 text-sm font-semibold">{t("connect.onThisPage")}</h2>
      <BuilderResource
        href="/dashboard/agent?tab=connect#mcp"
        label={t("connect.title")}
      />
      <BuilderResource
        href="/dashboard/agent?tab=connect#webhook"
        label={t("webhook.title")}
      />
      <BuilderResource
        href="/dashboard/agent?tab=connect#clients"
        label={t("connect.clients")}
      />
      <h2 className="pt-6 pb-2 text-sm font-semibold">{t("guides.title")}</h2>
      <BuilderResource href="/setup" label={t("guides.setup")} />
      <BuilderResource
        href={GUIDE_PATHS.registerAgentMcp}
        label={t("guides.register")}
      />
      <BuilderResource href="/agents" label={t("guides.catalog")} />
    </div>
  );
}
