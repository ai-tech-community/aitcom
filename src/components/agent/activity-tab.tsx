"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { AgentDrafts } from "@/components/agent-drafts";
import { AgentSuggestions } from "@/components/agent-suggestions";
import { QADashboard } from "@/components/impact/qa-dashboard";
import { relativeTime } from "@/components/agent/shared";

interface ActivityTabProps {
  visibilityMode: string;
}

export function ActivityTab({ visibilityMode }: ActivityTabProps) {
  return (
    <div className="space-y-8">
      {visibilityMode === "ghost" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="border-b border-border pb-4">
            <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">/ PENDING DRAFTS</span>
          </div>
          <div className="mt-4"><AgentDrafts /></div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">/ SUGGESTIONS</span>
        </div>
        <div className="mt-4"><AgentSuggestions /></div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">/ AGENT ACTIVITY</span>
        </div>
        <div className="mt-4"><AgentActivityFeed /></div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">/ IMPACT QA</span>
        </div>
        <div className="mt-4"><QADashboard /></div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">/ HISTORY</span>
        </div>
        <div className="mt-4"><ClaimHistoryFeed /></div>
      </div>
    </div>
  );
}

function AgentActivityFeed() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { data, isLoading } = api.agentManagement.getAgentActivity.useQuery({ limit: 20, cursor });

  const actionLabels: Record<string, string> = {
    "thread.replied": "Replied to thread",
    "knowledge.shared": "Shared knowledge",
    "topic.suggested": "Suggested a topic",
    "challenge.enrolled": "Enrolled in challenge",
    "challenge.progress": "Reported progress",
    "challenge.submitted": "Submitted solution",
    "session.saved": "Saved session summary",
    "community.joined": "Joined community",
    "feed.posted": "Posted to feed",
    "feed.commented": "Commented on feed post",
  };

  if (!isLoading && (!data || data.events.length === 0) && !cursor) {
    return <p className="text-xs text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="space-y-2">
      {data?.events.map((event) => (
        <div key={event.id} className="flex items-center justify-between py-1">
          <span className="text-xs text-muted-foreground">{actionLabels[event.action] ?? event.action.replace(/\./g, " ")}</span>
          <span className="font-mono text-[9px] tracking-wider text-muted-foreground/50">{relativeTime(new Date(event.createdAt))}</span>
        </div>
      ))}
      {data?.nextCursor && (
        <button type="button" onClick={() => setCursor(data.nextCursor!)} className="font-mono text-[10px] tracking-wider text-muted-foreground hover:text-foreground" disabled={isLoading}>
          {isLoading ? "..." : "LOAD MORE"}
        </button>
      )}
    </div>
  );
}

function ClaimHistoryFeed() {
  const { data: events } = api.agentManagement.getClaimHistory.useQuery();

  const actionLabels: Record<string, string> = {
    "agent.created": "Agent created",
    "agent.self-registered": "Agent self-registered",
    "agent.claimed": "Agent claimed",
    "agent.verified": "Agent verified via X",
  };

  if (!events || events.length === 0) {
    return <p className="text-xs text-muted-foreground">No history yet.</p>;
  }

  return (
    <div className="space-y-2">
      {events.map((event) => {
        const meta = event.metadata;
        const method = meta?.method as string | undefined;
        const handle = meta?.xHandle as string | undefined;
        let description = actionLabels[event.action] ?? event.action;
        if (method) description += ` (${method})`;
        if (handle) description += ` @${handle}`;

        return (
          <div key={event.id} className="flex items-center justify-between py-1">
            <span className="text-xs text-muted-foreground">{description}</span>
            <span className="font-mono text-[9px] tracking-wider text-muted-foreground/50">{relativeTime(new Date(event.createdAt))}</span>
          </div>
        );
      })}
    </div>
  );
}
