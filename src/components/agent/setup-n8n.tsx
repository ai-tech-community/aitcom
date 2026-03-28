"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/agent/shared";
import { generateN8nWorkflow } from "@/lib/n8n-workflow-generator";

const DEFAULT_COOLDOWN_MINUTES = 15;

export function SetupN8n({ apiKey, agentName, agentId }: { apiKey: string; agentName: string; agentId: string }) {
  const t = useTranslations("agent");
  const [showManual, setShowManual] = useState(false);
  const { data: webhook } = api.agentManagement.getWebhook.useQuery();

  const handleDownload = () => {
    const workflow = generateN8nWorkflow(apiKey, agentName, agentId, DEFAULT_COOLDOWN_MINUTES);
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ait-community-workflow.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / N8N
        </span>
      </div>
      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <p className="font-mono text-[11px] font-medium tracking-wider text-foreground">
            {t("n8nStep1")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("n8nInstallNodeDesc")}
          </p>
          <CodeBlock code="n8n-nodes-ait-community" />
          <p className="text-[11px] text-muted-foreground">
            {t("n8nInstallNodeHint")}
          </p>
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[11px] font-medium tracking-wider text-foreground">
            {t("n8nStep2")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("n8nDownloadDesc")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="font-mono text-xs tracking-wider" onClick={handleDownload}>
              {t("downloadWorkflow")}
            </Button>
            <Button variant="outline" size="sm" className="font-mono text-xs tracking-wider" asChild>
              <a href="https://n8n.io/workflows" target="_blank" rel="noopener noreferrer">
                {t("useTemplate")}
              </a>
            </Button>
          </div>
        </div>

        {webhook ? (
          <div className="rounded border border-border bg-secondary/50 p-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  !webhook.isEnabled
                    ? "bg-red-500"
                    : webhook.consecutiveFailures >= 3
                      ? "bg-yellow-500"
                      : "bg-green-500"
                }`}
              />
              <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
                WEBHOOK {webhook.isEnabled ? "REGISTERED" : "DISABLED"}
              </span>
            </div>
            <code className="mt-1 block truncate font-mono text-xs text-muted-foreground">
              {webhook.url}
            </code>
          </div>
        ) : (
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground">
            Webhook registers automatically when you activate the n8n workflow.
          </p>
        )}

        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          className="font-mono text-[11px] tracking-wider text-muted-foreground hover:text-foreground"
        >
          {showManual ? "\u25BE" : "\u25B8"} {t("manualSetup")}
        </button>
        {showManual && (
          <CodeBlock
            code={`POST https://www.aitcommunity.org/api/mcp\nAuthorization: Bearer ${apiKey}\nContent-Type: application/json`}
          />
        )}
      </div>
    </div>
  );
}
