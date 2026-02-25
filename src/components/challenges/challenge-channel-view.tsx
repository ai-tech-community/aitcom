"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ChallengeThreadCard } from "@/components/challenges/challenge-thread-card";
import { ChallengeThreadDetail } from "@/components/challenges/challenge-thread-detail";
import { ChallengeCompose } from "@/components/challenges/challenge-compose";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChallengeChannelViewProps {
  challengeId: number;
}

type ThreadTypeFilter =
  | undefined
  | "announcement"
  | "discussion"
  | "question"
  | "progress-log"
  | "solution";

interface FilterTab {
  label: string;
  value: ThreadTypeFilter;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const filterTabs: FilterTab[] = [
  { label: "All", value: undefined },
  { label: "Announcements", value: "announcement" },
  { label: "Discussion", value: "discussion" },
  { label: "Q&A", value: "question" },
  { label: "Progress Logs", value: "progress-log" },
  { label: "Solutions", value: "solution" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChallengeChannelView({
  challengeId,
}: ChallengeChannelViewProps) {
  const [typeFilter, setTypeFilter] = useState<ThreadTypeFilter>(undefined);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const { data: channel, isLoading: channelLoading } =
    api.challengeChannel.getChannel.useQuery({ challengeId });

  const {
    data: threadsData,
    isLoading: threadsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = api.challengeChannel.listThreads.useInfiniteQuery(
    {
      channelId: channel?.id ?? "",
      type: typeFilter,
      limit: 50,
    },
    {
      enabled: !!channel?.id,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialCursor: null,
    },
  );

  const threads = threadsData?.pages.flatMap((p) => p.threads) ?? [];

  const filterPillClass = (value: ThreadTypeFilter) =>
    `rounded-full px-3 py-1 font-mono text-xs tracking-wider transition-colors ${
      typeFilter === value
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-muted-foreground hover:text-foreground"
    }`;

  // ---- Loading / no channel states ----
  if (channelLoading) {
    return (
      <div className="mt-8">
        <div className="text-sm text-muted-foreground">Loading channel...</div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="mt-8">
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No channel yet. Enroll to create the channel.
          </p>
        </div>
      </div>
    );
  }

  // ---- Thread detail view ----
  if (selectedThreadId) {
    return (
      <ChallengeThreadDetail
        threadId={selectedThreadId}
        onBack={() => setSelectedThreadId(null)}
      />
    );
  }

  // ---- Compose view ----
  if (composing) {
    return (
      <ChallengeCompose
        channelId={channel.id}
        onCancel={() => setComposing(false)}
        onCreated={() => setComposing(false)}
      />
    );
  }

  // ---- Thread list view ----
  return (
    <div className="mt-8">
      {/* Header + New Thread button */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / CHANNEL
        </span>
        <Button
          size="sm"
          className="font-mono text-xs tracking-wider"
          onClick={() => setComposing(true)}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Thread
        </Button>
      </div>

      {/* Type filter tabs */}
      <div className="mt-4 flex flex-wrap gap-2">
        {filterTabs.map((ft) => (
          <button
            key={ft.label}
            type="button"
            onClick={() => setTypeFilter(ft.value)}
            className={filterPillClass(ft.value)}
          >
            {ft.label}
          </button>
        ))}
      </div>

      {/* Thread list */}
      <div className="mt-4 space-y-2">
        {threadsLoading ? (
          <p className="text-sm text-muted-foreground">Loading threads...</p>
        ) : threads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No threads yet. Start the conversation!
            </p>
          </div>
        ) : (
          threads.map((thread) => (
            <ChallengeThreadCard
              key={thread.id}
              thread={thread}
              onClick={() => setSelectedThreadId(thread.id)}
            />
          ))
        )}
      </div>

      {/* Load more */}
      {hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="font-mono text-xs tracking-wider"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
