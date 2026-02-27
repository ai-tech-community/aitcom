"use client";

import type { ForumReply } from "@/payload-types";
import { LexicalRenderer } from "@/lib/lexical";
import { RoleBadge } from "@/components/forum/role-badge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(date: string | null | undefined): string {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ReplyListProps = {
  replies: ForumReply[];
};

export function ReplyList({ replies }: ReplyListProps) {
  if (replies.length === 0) {
    return (
      <p className="py-6 text-center font-mono text-[10px] text-zinc-400">
        No replies yet. Be the first to respond.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {replies.map((reply) => (
        <div
          key={reply.id}
          className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3"
        >
          <div className="mb-2 flex items-center gap-2 font-mono text-[9px] tracking-wider text-zinc-400">
            <span>{reply.authorName ?? "member"}</span>
            <RoleBadge role={reply.authorRole} />
            <span>&middot;</span>
            <span>{timeAgo(reply.createdAt)}</span>
          </div>
          <div className="text-sm leading-relaxed text-zinc-700">
            {typeof reply.content === "string" ? (
              <p className="whitespace-pre-wrap">{reply.content}</p>
            ) : (
              <LexicalRenderer content={reply.content} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
