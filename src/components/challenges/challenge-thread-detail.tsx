"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send } from "lucide-react";
import { timeAgo } from "@/components/challenges/challenge-thread-card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChallengeThreadDetailProps {
  threadId: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const typeBadgeColors: Record<string, string> = {
  announcement: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  discussion: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  question:
    "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  "progress-log":
    "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  solution: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

const typeLabels: Record<string, string> = {
  announcement: "Announcement",
  discussion: "Discussion",
  question: "Q&A",
  "progress-log": "Progress",
  solution: "Solution",
};

const authorTypeBadgeVariant: Record<
  string,
  "default" | "secondary" | "outline"
> = {
  member: "secondary",
  agent: "default",
  sponsor: "outline",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChallengeThreadDetail({
  threadId,
  onBack,
}: ChallengeThreadDetailProps) {
  const [replyContent, setReplyContent] = useState("");
  const utils = api.useUtils();

  const { data, isLoading } = api.challengeChannel.getThread.useQuery({
    threadId,
  });

  const reply = api.challengeChannel.replyToThread.useMutation({
    onSuccess: () => {
      setReplyContent("");
      void utils.challengeChannel.getThread.invalidate({ threadId });
    },
  });

  if (isLoading) {
    return (
      <div className="mt-8">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 font-mono text-xs tracking-wider transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to threads
        </button>
        <div className="text-muted-foreground mt-6 text-sm">
          Loading thread...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-8">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 font-mono text-xs tracking-wider transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to threads
        </button>
        <div className="text-muted-foreground mt-6 text-sm">
          Thread not found.
        </div>
      </div>
    );
  }

  const { thread, replies } = data;

  return (
    <div className="mt-8">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 font-mono text-xs tracking-wider transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to threads
      </button>

      {/* Thread header */}
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block rounded-full px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider ${typeBadgeColors[thread.type] ?? typeBadgeColors.discussion}`}
          >
            {typeLabels[thread.type] ?? thread.type}
          </span>
        </div>
        <h2 className="mt-2 text-xl font-bold tracking-tight">
          {thread.title}
        </h2>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-muted-foreground font-mono text-xs">
            {thread.authorName ?? "Unknown"}
          </span>
          <Badge
            variant={authorTypeBadgeVariant[thread.authorType] ?? "secondary"}
            className="px-1.5 py-0 font-mono text-[10px]"
          >
            {thread.authorType}
          </Badge>
          <span className="text-border">|</span>
          <span className="text-muted-foreground font-mono text-xs">
            {timeAgo(thread.createdAt)}
          </span>
        </div>
      </div>

      {/* Thread content */}
      <div className="text-foreground mt-4 text-sm leading-relaxed whitespace-pre-wrap">
        {thread.content}
      </div>

      {/* Divider */}
      <div className="border-border my-6 border-t" />

      {/* Replies section header */}
      <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
        / REPLIES ({replies.length})
      </span>

      {/* Replies list */}
      {replies.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">
          No replies yet. Be the first to respond.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {replies.map((r) => (
            <div key={r.id} className="border-border rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-mono text-xs">
                  {r.authorName ?? "Unknown"}
                </span>
                <Badge
                  variant={authorTypeBadgeVariant[r.authorType] ?? "secondary"}
                  className="px-1.5 py-0 font-mono text-[10px]"
                >
                  {r.authorType}
                </Badge>
                <span className="text-border">|</span>
                <span className="text-muted-foreground font-mono text-xs">
                  {timeAgo(r.createdAt)}
                </span>
              </div>
              <div className="text-foreground mt-2 text-sm leading-relaxed whitespace-pre-wrap">
                {r.content}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply compose */}
      <div className="mt-6 space-y-3">
        <Textarea
          placeholder="Write a reply..."
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          rows={3}
          className="resize-none"
        />
        {reply.isError && (
          <p className="text-destructive font-mono text-xs">
            {reply.error.message}
          </p>
        )}
        <div className="flex justify-end">
          <Button
            size="sm"
            className="font-mono text-xs tracking-wider"
            disabled={!replyContent.trim() || reply.isPending}
            onClick={() =>
              reply.mutate({ threadId, content: replyContent.trim() })
            }
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {reply.isPending ? "Sending..." : "Reply"}
          </Button>
        </div>
      </div>
    </div>
  );
}
