"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ForumReply } from "@/payload-types";
import { LexicalRenderer } from "@/lib/lexical";
import { RoleBadge } from "@/components/forum/role-badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { api } from "@/trpc/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ReplyListProps = {
  replies: ForumReply[];
  currentUserId?: string;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
  threadSlug: string;
};

export function ReplyList({
  replies,
  currentUserId,
  memberRole,
  threadSlug,
}: ReplyListProps) {
  const t = useTranslations("forum");
  const utils = api.useUtils();
  const canModerate =
    memberRole === "owner" ||
    memberRole === "admin" ||
    memberRole === "moderator";
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const editMutation = api.forum.editReply.useMutation({
    onSuccess: () => {
      toast.success(t("replyEdited"));
      setEditingId(null);
      void utils.forum.getReplies.invalidate();
    },
  });

  const deleteMutation = api.forum.deleteReply.useMutation({
    onSuccess: () => {
      toast.success(t("replyDeleted"));
      void utils.forum.getReplies.invalidate();
      void utils.forum.getThread.invalidate({ slug: threadSlug });
    },
  });

  if (replies.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center font-mono text-xs">
        No replies yet. Be the first to respond.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {replies.map((reply) =>
        reply.isDeleted ? (
          <div
            key={reply.id}
            className="border-border bg-muted rounded-lg border p-3"
          >
            <p className="text-muted-foreground text-sm italic">
              {t("replyDeletedMessage")}
            </p>
          </div>
        ) : (
          <div
            key={reply.id}
            className="border-border bg-muted rounded-lg border p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-muted-foreground flex items-center gap-2 font-mono text-xs tracking-wider">
                <span>{reply.authorName ?? "member"}</span>
                <RoleBadge role={reply.authorRole} />
                <span>&middot;</span>
                {reply.createdAt && <RelativeTime date={reply.createdAt} />}
                {reply.isEdited && (
                  <span className="italic">({t("edited")})</span>
                )}
              </div>
              {(currentUserId === reply.authorId || canModerate) && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="hover:bg-accent rounded p-1">
                    <MoreHorizontal className="text-muted-foreground h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {currentUserId === reply.authorId && (
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingId(reply.id);
                          setEditContent("");
                        }}
                      >
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        {t("edit")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        if (window.confirm(t("deleteReplyConfirm")))
                          deleteMutation.mutate({ replyId: reply.id });
                      }}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      {t("delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {editingId === reply.id ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  className="border-border w-full rounded-md border px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      editMutation.mutate({
                        replyId: reply.id,
                        content: editContent,
                      })
                    }
                    disabled={editMutation.isPending}
                    className="bg-primary text-primary-foreground rounded-md px-3 py-1 text-xs font-semibold"
                  >
                    {t("save")}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-md border px-3 py-1 text-xs"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-foreground text-sm leading-relaxed">
                <LexicalRenderer content={reply.content} />
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}
