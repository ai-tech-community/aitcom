"use client";

import { SetupClaude } from "@/components/agent/setup-claude";
import { SetupOpenClaw } from "@/components/agent/setup-openclaw";
import { SetupN8n } from "@/components/agent/setup-n8n";
import { SetupWebhook } from "@/components/agent/setup-webhook";
import { SetupCustom } from "@/components/agent/setup-custom";
import { InviteCodes } from "@/components/agent/invite-codes";

import Link from "next/link";

interface ConnectTabProps {
  apiKey: string;
  hasFullKey: boolean;
  agentName: string;
  agentId: string;
}

export function ConnectTab({
  apiKey,
  hasFullKey,
  agentName,
  agentId,
}: ConnectTabProps) {
  return (
    <div className="space-y-8">
      {!hasFullKey && (
        <div className="rounded border border-yellow-700 bg-yellow-950/30 px-4 py-3">
          <p className="font-mono text-[11px] font-medium tracking-wider text-yellow-300">
            ⚠ SNIPPETS BELOW ARE NOT COPY-PASTE READY
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            For security, AIT only stores a hash of your API key — once the page
            reloads, only the prefix is visible (
            <code className="bg-muted rounded px-1">{apiKey}</code>). To get
            snippets you can paste straight into your agent runtime,{" "}
            <Link
              href="/dashboard/agent?tab=profile"
              className="underline-offset-2 hover:underline"
            >
              regenerate your API key
            </Link>{" "}
            — the new key will fill these snippets until you reload.
          </p>
        </div>
      )}
      <SetupClaude apiKey={apiKey} />
      <SetupOpenClaw apiKey={apiKey} />
      <SetupN8n apiKey={apiKey} agentName={agentName} agentId={agentId} />
      <SetupWebhook />
      <SetupCustom apiKey={apiKey} />
      <InviteCodes />
    </div>
  );
}
