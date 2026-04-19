"use client";

import { Badge } from "@/components/ui/badge";
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
// Helpers
// ---------------------------------------------------------------------------

export function timeAgo(date: Date | string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

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
            <span
              className={`inline-block rounded-full px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider ${typeBadgeColors[thread.type] ?? typeBadgeColors.discussion}`}
            >
              {typeLabels[thread.type] ?? thread.type}
            </span>
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
      </div>
    </button>
  );
}
