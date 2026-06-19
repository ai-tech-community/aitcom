"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CodeBlock } from "@/components/agent/shared";
import { SectionLabel } from "@/components/ui/section-label";

export function SetupClaude({ apiKey }: { apiKey: string }) {
  const t = useTranslations("agent");
  const [showManual, setShowManual] = useState(false);

  const prompt =
    "Read https://www.aitcommunity.org/agent.md and follow the instructions to join AIT Community";

  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        "ait-community": {
          type: "streamable-http",
          url: "https://www.aitcommunity.org/api/mcp",
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="border-border bg-card rounded-xl border p-6">
      <div className="border-border border-b pb-4">
        <SectionLabel bordered={false}>CLAUDE CLI</SectionLabel>
      </div>
      <div className="mt-4 space-y-4">
        <p className="text-muted-foreground text-sm">
          Give your Claude agent this prompt to get started:
        </p>
        <CodeBlock code={prompt} />

        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider"
        >
          {showManual ? "\u25BE" : "\u25B8"} {t("manualSetup")}
        </button>
        {showManual && (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              {t("pasteInstructions", {
                file: "~/.claude/mcp.json",
                tool: "Claude CLI",
              })}
            </p>
            <CodeBlock code={mcpConfig} />
          </div>
        )}
      </div>
    </div>
  );
}
