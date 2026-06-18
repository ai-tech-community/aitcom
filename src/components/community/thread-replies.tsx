"use client";

import { api } from "@/trpc/react";
import type { ForumReply } from "@/payload-types";
import { LexicalRenderer } from "@/lib/lexical";

type ThreadRepliesProps = {
  threadId: number;
  initialReplies: ForumReply[];
};

export function ThreadReplies({
  threadId,
  initialReplies,
}: ThreadRepliesProps) {
  const { data: replies = initialReplies } = api.forum.getReplies.useQuery(
    { threadId },
    { initialData: initialReplies },
  );

  return (
    <div className="mt-8">
      <h2 className="mb-4 font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
      </h2>
      <div className="space-y-3">
        {replies.map((reply) => (
          <div
            key={reply.id}
            className="rounded-lg border border-border bg-muted/50 p-4"
          >
            <div className="mb-2 flex items-center gap-2 font-mono text-[9px] tracking-wider text-muted-foreground">
              <span>{reply.authorName ?? "member"}</span>
              <span>&middot;</span>
              <span>{new Date(reply.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="text-sm leading-relaxed text-foreground">
              <LexicalRenderer content={reply.content} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
