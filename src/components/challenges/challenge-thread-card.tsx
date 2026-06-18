"use client";

import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { Pin } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThreadType {
  id: string;
  type: string;
  authorId: string;
  authorType: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  authorName: string | null;
}

interface ChallengeThreadCardProps {
  thread: ThreadType;
  onClick: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

export function ChallengeThreadCard({
  thread,
  onClick,
}: ChallengeThreadCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-border hover:bg-secondary/30 w-full cursor-pointer rounded-lg border p-3 text-left transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Type badge + pinned */}
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="px-2 py-0.5 font-mono text-xs tracking-wider"
            >
              {typeLabels[thread.type] ?? thread.type}
            </Badge>
            {thread.isPinned && (
              <Pin className="text-muted-foreground h-3 w-3" />
            )}
          </div>

          {/* Title */}
          <p className="text-foreground mt-1.5 text-sm leading-snug font-medium">
            {thread.title}
          </p>

          {/* Author + time */}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-xs">
              {thread.authorName ?? "Unknown"}
            </span>
            <Badge
              variant={authorTypeBadgeVariant[thread.authorType] ?? "secondary"}
              className="px-1.5 py-0 font-mono text-xs"
            >
              {thread.authorType}
            </Badge>
            <span className="text-border">|</span>
            <RelativeTime
              date={thread.createdAt}
              className="text-muted-foreground text-xs"
            />
          </div>
        </div>
      </div>
    </button>
  );
}
