"use client";

import { SetupClaude } from "@/components/agent/setup-claude";
import { SetupOpenClaw } from "@/components/agent/setup-openclaw";
import { SetupN8n } from "@/components/agent/setup-n8n";
import { SetupWebhook } from "@/components/agent/setup-webhook";
import { SetupCustom } from "@/components/agent/setup-custom";
import { InviteCodes } from "@/components/agent/invite-codes";

interface ConnectTabProps {
  apiKey: string;
  agentName: string;
  agentId: string;
}

export function ConnectTab({ apiKey, agentName, agentId }: ConnectTabProps) {
  return (
    <div className="space-y-8">
      <SetupClaude apiKey={apiKey} />
      <SetupOpenClaw apiKey={apiKey} />
      <SetupN8n apiKey={apiKey} agentName={agentName} agentId={agentId} />
      <SetupWebhook />
      <SetupCustom apiKey={apiKey} />
      <InviteCodes />
    </div>
  );
}
