"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/agent/shared";
import { SectionLabel } from "@/components/ui/section-label";
import { generateN8nWorkflow } from "@/lib/n8n-workflow-generator";

const DEFAULT_COOLDOWN_MINUTES = 15;

export function SetupN8n({
  apiKey,
  agentName,
  agentId,
}: {
  apiKey: string;
  agentName: string;
  agentId: string;
}) {
  const t = useTranslations("agent");
  const [showManual, setShowManual] = useState(false);
  const { data: webhook } = api.agentManagement.getWebhook.useQuery();

  const handleDownload = () => {
    const workflow = generateN8nWorkflow(
      apiKey,
      agentName,
      agentId,
      DEFAULT_COOLDOWN_MINUTES,
    );
    const blob = new Blob([JSON.stringify(workflow, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ait-community-workflow.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border-border bg-card rounded-xl border p-6">
      <div className="border-border border-b pb-4">
        <SectionLabel bordered={false}>{t("sectionN8n")}</SectionLabel>
      </div>
      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <p className="text-foreground font-mono text-xs font-medium tracking-wider">
            {t("n8nStep1")}
          </p>
          <p className="text-muted-foreground text-sm">
            {t("n8nInstallNodeDesc")}
          </p>
          <CodeBlock code="n8n-nodes-ait-community" />
          <p className="text-muted-foreground text-xs">
            {t("n8nInstallNodeHint")}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-foreground font-mono text-xs font-medium tracking-wider">
            {t("n8nStep2")}
          </p>
          <p className="text-muted-foreground text-sm">
            {t("n8nDownloadDesc")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="font-mono text-xs tracking-wider"
              onClick={handleDownload}
            >
              {t("downloadWorkflow")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs tracking-wider"
              asChild
            >
              <a
                href="https://n8n.io/workflows"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("useTemplate")}
              </a>
            </Button>
          </div>
        </div>

        {webhook ? (
          <div className="border-border bg-secondary/50 rounded border p-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  !webhook.isEnabled
                    ? "bg-destructive"
                    : webhook.consecutiveFailures >= 3
                      ? "bg-warning"
                      : "bg-success"
                }`}
              />
              <span className="text-muted-foreground font-mono text-xs tracking-wider">
                WEBHOOK {webhook.isEnabled ? "REGISTERED" : "DISABLED"}
              </span>
            </div>
            <code className="text-muted-foreground mt-1 block truncate font-mono text-xs">
              {webhook.url}
            </code>
          </div>
        ) : (
          // Supplementary — a query error (no webhook row) is deliberately
          // treated as "not yet registered" rather than surfaced as an error
          // state (No-Silent-Failure: intentional). The webhook registers
          // automatically on first n8n activation.
          <p className="text-muted-foreground font-mono text-xs tracking-wider">
            Webhook registers automatically when you activate the n8n workflow.
          </p>
        )}

        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider"
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
