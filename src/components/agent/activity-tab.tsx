"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { AgentDrafts } from "@/components/agent-drafts";
import { AgentSuggestions } from "@/components/agent-suggestions";
import { QADashboard } from "@/components/impact/qa-dashboard";
import { RelativeTime } from "@/components/ui/relative-time";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";

export function ActivityTab() {
  const t = useTranslations("agent");
  return (
    <div className="space-y-8">
      <div className="border-border bg-card rounded-xl border p-6">
        <div className="border-border border-b pb-4">
          <SectionLabel bordered={false}>{t("sectionPendingDrafts")}</SectionLabel>
        </div>
        <div className="mt-4">
          <AgentDrafts />
        </div>
      </div>

      <div className="border-border bg-card rounded-xl border p-6">
        <div className="border-border border-b pb-4">
          <SectionLabel bordered={false}>{t("sectionSuggestions")}</SectionLabel>
        </div>
        <div className="mt-4">
          <AgentSuggestions />
        </div>
      </div>

      <div className="border-border bg-card rounded-xl border p-6">
        <div className="border-border border-b pb-4">
          <SectionLabel bordered={false}>{t("sectionActivity")}</SectionLabel>
        </div>
        <div className="mt-4">
          <AgentActivityFeed />
        </div>
      </div>

      <div className="border-border bg-card rounded-xl border p-6">
        <div className="border-border border-b pb-4">
          <SectionLabel bordered={false}>{t("sectionImpactQa")}</SectionLabel>
        </div>
        <div className="mt-4">
          <QADashboard />
        </div>
      </div>

      <div className="border-border bg-card rounded-xl border p-6">
        <div className="border-border border-b pb-4">
          <SectionLabel bordered={false}>{t("sectionHistory")}</SectionLabel>
        </div>
        <div className="mt-4">
          <ClaimHistoryFeed />
        </div>
      </div>
    </div>
  );
}

function AgentActivityFeed() {
  const tc = useTranslations("common");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { data, isLoading, isError, refetch } =
    api.agentManagement.getAgentActivity.useQuery({
      limit: 20,
      cursor,
    });

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

  if (isLoading && !cursor) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-1">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState onRetry={() => void refetch()} />;
  }

  if (!isLoading && (!data || data.events.length === 0) && !cursor) {
    return <p className="text-muted-foreground text-xs">No activity yet.</p>;
  }

  return (
    <div className="space-y-2">
      {data?.events.map((event) => (
        <div key={event.id} className="flex items-center justify-between py-1">
          <span className="text-muted-foreground text-xs">
            {actionLabels[event.action] ?? event.action.replace(/\./g, " ")}
          </span>
          <RelativeTime
            date={new Date(event.createdAt)}
            className="text-muted-foreground/50 text-xs tracking-wider"
          />
        </div>
      ))}
      {data?.nextCursor && (
        <button
          type="button"
          onClick={() => setCursor(data.nextCursor!)}
          className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider"
          disabled={isLoading}
        >
          {isLoading ? "..." : tc("loadMore")}
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
    return <p className="text-muted-foreground text-xs">No history yet.</p>;
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
          <div
            key={event.id}
            className="flex items-center justify-between py-1"
          >
            <span className="text-muted-foreground text-xs">{description}</span>
            <RelativeTime
              date={new Date(event.createdAt)}
              className="text-muted-foreground/50 text-xs tracking-wider"
            />
          </div>
        );
      })}
    </div>
  );
}
