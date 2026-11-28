"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/agent/shared";
import { SectionLabel } from "@/components/ui/section-label";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { builderMcpEndpoint } from "@/components/builder/mcp-config";
import { MCP_ENDPOINT } from "@/lib/setup-guide";
import { BuilderCode } from "@/components/builder/builder-code";
import { builderControl } from "@/components/builder/builder-ui";
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
  const builder = useTranslations("redesign.builder.connect");
  const redesigned = isOpenCommunitiesEnabled();
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

  const manualRequest = `POST ${redesigned ? builderMcpEndpoint : MCP_ENDPOINT}\nAuthorization: Bearer ${apiKey}\nContent-Type: application/json`;

  return (
    <div
      className={
        redesigned ? undefined : "border-border bg-card rounded-xl border p-6"
      }
    >
      {!redesigned && (
        <div className="border-border border-b pb-4">
          <SectionLabel bordered={false}>{t("sectionN8n")}</SectionLabel>
        </div>
      )}
      <div className={redesigned ? "space-y-4" : "mt-4 space-y-4"}>
        <div className="space-y-2">
          <p
            className={
              redesigned
                ? "text-sm font-semibold"
                : "text-foreground font-mono text-xs font-medium tracking-wider"
            }
          >
            {redesigned ? builder("n8nStep1") : t("n8nStep1")}
          </p>
          <p className="text-muted-foreground text-sm">
            {t("n8nInstallNodeDesc")}
          </p>
          {redesigned ? (
            <BuilderCode label="npm" value="n8n-nodes-ait-community" />
          ) : (
            <CodeBlock code="n8n-nodes-ait-community" />
          )}
          <p className="text-muted-foreground text-xs">
            {t("n8nInstallNodeHint")}
          </p>
        </div>

        <div className="space-y-2">
          <p
            className={
              redesigned
                ? "text-sm font-semibold"
                : "text-foreground font-mono text-xs font-medium tracking-wider"
            }
          >
            {redesigned ? builder("n8nStep2") : t("n8nStep2")}
          </p>
          <p className="text-muted-foreground text-sm">
            {t("n8nDownloadDesc")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={redesigned ? "ink" : "default"}
              className={
                redesigned ? builderControl : "font-mono text-xs tracking-wider"
              }
              onClick={handleDownload}
            >
              {t("downloadWorkflow")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={
                redesigned ? builderControl : "font-mono text-xs tracking-wider"
              }
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
                {redesigned ? (
                  builder(webhook.isEnabled ? "n8nRegistered" : "n8nDisabled")
                ) : (
                  <>WEBHOOK {webhook.isEnabled ? "REGISTERED" : "DISABLED"}</>
                )}
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
            {redesigned
              ? builder("n8nEmpty")
              : "Webhook registers automatically when you activate the n8n workflow."}
          </p>
        )}

        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          aria-expanded={redesigned ? showManual : undefined}
          className={
            redesigned
              ? "focus-visible:outline-ring min-h-11 text-sm underline underline-offset-4 focus-visible:outline-2"
              : "text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider"
          }
        >
          {showManual ? "\u25BE" : "\u25B8"} {t("manualSetup")}
        </button>
        {showManual &&
          (redesigned ? (
            <BuilderCode label="HTTP" value={manualRequest} maskKey={apiKey} />
          ) : (
            <CodeBlock code={manualRequest} />
          ))}
      </div>
    </div>
  );
}
