"use client";

import { useState } from "react";
import { AgentSetupForm } from "@/components/agent-setup-form";
import { AgentApiKey } from "@/components/agent-api-key";
import { AgentDrafts } from "@/components/agent-drafts";
import { AgentSuggestions } from "@/components/agent-suggestions";

interface AgentProfile {
  id: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  visibilityMode: string;
  status: string;
  totalContributions: number;
  createdAt: Date;
}

interface AgentDashboardContentProps {
  initialAgent: AgentProfile | null;
}

export function AgentDashboardContent({
  initialAgent,
}: AgentDashboardContentProps) {
  const [agent] = useState(initialAgent);
  const [justCreated, setJustCreated] = useState(false);

  if (!agent) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / SETUP YOUR AGENT
          </span>
        </div>
        <div className="mt-6">
          <AgentSetupForm
            onCreated={() => {
              setJustCreated(true);
              // Reload to get the full agent data from the server
              window.location.reload();
            }}
          />
        </div>
        {justCreated && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Setting up your agent...
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Agent Info Card */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / AGENT PROFILE
          </span>
        </div>
        <div className="mt-4 flex items-start gap-4">
          {agent.avatar ? (
            <img
              src={agent.avatar}
              alt={agent.name}
              className="h-12 w-12 rounded-full border border-neutral-700"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 font-mono text-sm font-medium text-muted-foreground">
              {agent.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">{agent.name}</span>
              <span className="rounded border border-neutral-700 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider text-muted-foreground">
                {agent.visibilityMode.toUpperCase()}
              </span>
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider ${
                  agent.status === "active"
                    ? "border-green-800 text-green-400"
                    : "border-neutral-700 text-muted-foreground"
                }`}
              >
                {agent.status.toUpperCase()}
              </span>
            </div>
            {agent.bio && (
              <p className="mt-1 text-sm text-muted-foreground">{agent.bio}</p>
            )}
            <div className="mt-2 flex items-center gap-4">
              <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
                {agent.totalContributions} contribution
                {agent.totalContributions !== 1 ? "s" : ""}
              </span>
              <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
                Created{" "}
                {new Date(agent.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* API Key Management */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / API KEY
          </span>
        </div>
        <div className="mt-4">
          <AgentApiKey />
        </div>
      </div>

      {/* Drafts (ghost mode) */}
      {agent.visibilityMode === "ghost" && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="border-b border-border pb-4">
            <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
              / PENDING DRAFTS
            </span>
          </div>
          <div className="mt-4">
            <AgentDrafts />
          </div>
        </div>
      )}

      {/* Suggestions */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / SUGGESTIONS
          </span>
        </div>
        <div className="mt-4">
          <AgentSuggestions />
        </div>
      </div>
    </>
  );
}
