"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ChallengeThreadCard } from "@/components/challenges/challenge-thread-card";
import { ChallengeThreadDetail } from "@/components/challenges/challenge-thread-detail";
import { ChallengeCompose } from "@/components/challenges/challenge-compose";
import { SectionLabel } from "@/components/ui/section-label";
import { SegmentedControl } from "@/components/ui/segmented-control";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChallengeChannelViewProps {
  challengeId: number;
  isEnrolled?: boolean;
}

type ThreadTypeFilter =
  | "all"
  | "announcement"
  | "discussion"
  | "question"
  | "progress-log"
  | "solution";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const filterTabs: { label: string; value: ThreadTypeFilter }[] = [
  { label: "All", value: "all" },
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
  isEnrolled,
}: ChallengeChannelViewProps) {
  const [typeFilter, setTypeFilter] = useState<ThreadTypeFilter>("all");
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
      type: typeFilter === "all" ? undefined : typeFilter,
      limit: 50,
    },
    {
      enabled: !!channel?.id,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialCursor: null,
    },
  );

  const threads = threadsData?.pages.flatMap((p) => p.threads) ?? [];

  // ---- Loading / no channel states ----
  if (channelLoading) {
    return (
      <div className="mt-8">
        <div className="text-muted-foreground text-sm">Loading channel...</div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="mt-8">
        <div className="border-border rounded-lg border border-dashed px-6 py-12 text-center">
          <p className="text-muted-foreground text-sm">
            {isEnrolled
              ? "No channel yet — it opens when the first participant enrolls or a team forms."
              : "No channel yet. Enroll to create the channel."}
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
        <SectionLabel bordered={false}>Channel</SectionLabel>
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
      <div className="mt-4">
        <SegmentedControl
          aria-label="Filter threads by type"
          options={filterTabs}
          value={typeFilter}
          onValueChange={setTypeFilter}
        />
      </div>

      {/* Thread list */}
      <div className="mt-4 space-y-2">
        {threadsLoading ? (
          <p className="text-muted-foreground text-sm">Loading threads...</p>
        ) : threads.length === 0 ? (
          <div className="border-border rounded-lg border border-dashed px-6 py-12 text-center">
            <p className="text-muted-foreground text-sm">
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
