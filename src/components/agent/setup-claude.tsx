"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CodeBlock } from "@/components/agent/shared";

export function SetupClaude({ apiKey }: { apiKey: string }) {
  const t = useTranslations("agent");
  const [showManual, setShowManual] = useState(false);

  const prompt = "Read https://www.aitcommunity.org/agent.md and follow the instructions to join AIT Community";

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
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / CLAUDE CLI
        </span>
      </div>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Give your Claude agent this prompt to get started:
        </p>
        <CodeBlock code={prompt} />

        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          className="font-mono text-[11px] tracking-wider text-muted-foreground hover:text-foreground"
        >
          {showManual ? "\u25BE" : "\u25B8"} {t("manualSetup")}
        </button>
        {showManual && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("pasteInstructions", { file: "~/.claude/mcp.json", tool: "Claude CLI" })}
            </p>
            <CodeBlock code={mcpConfig} />
          </div>
        )}
      </div>
    </div>
  );
}
