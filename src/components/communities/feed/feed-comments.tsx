"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface FeedComment {
  id: number;
  content: string;
  authorId: string;
  authorName?: string | null;
  communityId: string;
  isDeleted?: boolean | null;
  isEdited?: boolean | null;
  editedAt?: string | null;
  createdAt: string;
}

interface FeedCommentsProps {
  postId: number;
  communitySlug: string;
  currentUserId?: string;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
}

export function FeedComments({
  postId,
  communitySlug,
  currentUserId,
  memberRole,
}: FeedCommentsProps) {
  const t = useTranslations("communities.feed");
  const utils = api.useUtils();
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const isPrivileged =
    memberRole === "owner" || memberRole === "admin" || memberRole === "moderator";

  const { data: comments = [], isLoading } = api.feed.getComments.useQuery({ postId });

  const addComment = api.feed.addComment.useMutation({
    onSuccess: () => {
      toast.success(t("commentCreated"));
      setNewComment("");
      void utils.feed.getComments.invalidate({ postId });
      void utils.feed.getFeed.invalidate({ communitySlug });
    },
    onError: () => toast.error("Failed to add comment"),
  });

  const editComment = api.feed.editComment.useMutation({
    onSuccess: () => {
      toast.success(t("commentEdited"));
      setEditingId(null);
      void utils.feed.getComments.invalidate({ postId });
    },
    onError: () => toast.error("Failed to update comment"),
  });

  const deleteComment = api.feed.deleteComment.useMutation({
    onSuccess: () => {
      toast.success(t("commentDeleted"));
      void utils.feed.getComments.invalidate({ postId });
      void utils.feed.getFeed.invalidate({ communitySlug });
    },
    onError: () => toast.error("Failed to delete comment"),
  });

  if (isLoading) {
    return (
      <div className="space-y-2 border-l border-border pl-4 pt-1">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 border-l border-border pl-4 pt-1">
      {/* Comment list */}
      {(comments as FeedComment[]).map((comment) => {
        const isAuthor = !!currentUserId && comment.authorId === currentUserId;
        const canModify = isAuthor || isPrivileged;
        const initials = (comment.authorName ?? "?")[0]?.toUpperCase() ?? "?";

        if (comment.isDeleted) {
          return (
            <p key={comment.id} className="font-mono text-[11px] text-muted-foreground">
              {t("commentDeletedMessage")}
            </p>
          );
        }

        return (
          <div key={comment.id} className="flex items-start gap-2">
            <Avatar className="mt-0.5 size-6 shrink-0">
              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-1">
                <div>
                  <span className="text-xs font-medium">{comment.authorName ?? "Member"}</span>
                  <span className="ml-1.5 text-[10px] text-muted-foreground">
                    {timeAgo(comment.createdAt)}
                    {comment.isEdited ? ` · (${t("edited")})` : ""}
                  </span>
                </div>
                {canModify && currentUserId ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-5 shrink-0">
                        <MoreHorizontal className="size-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isAuthor && (
                        <DropdownMenuItem
                          onClick={() => {
                            setEditContent(comment.content);
                            setEditingId(comment.id);
                          }}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          {t("edit")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (window.confirm(t("deleteCommentConfirm"))) {
                            deleteComment.mutate({ commentId: comment.id });
                          }
                        }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        {t("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>

              {editingId === comment.id ? (
                <div className="mt-1 space-y-1.5">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    maxLength={1000}
                    rows={2}
                    className="resize-none text-sm"
                    autoFocus
                  />
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        editComment.mutate({
                          commentId: comment.id,
                          content: editContent.trim(),
                        })
                      }
                      disabled={!editContent.trim() || editComment.isPending}
                    >
                      {t("save")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setEditingId(null)}
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{comment.content}</p>
              )}
            </div>
          </div>
        );
      })}

      {/* New comment form */}
      {currentUserId ? (
        <div className="flex items-start gap-2 pt-1">
          <Avatar className="mt-0.5 size-6 shrink-0">
            <AvatarFallback className="text-[10px]">Y</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1.5">
            <Textarea
              placeholder={t("commentPlaceholder")}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              maxLength={1000}
              rows={2}
              className="resize-none text-sm"
            />
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                if (newComment.trim()) {
                  addComment.mutate({ postId, content: newComment.trim() });
                }
              }}
              disabled={!newComment.trim() || addComment.isPending}
            >
              {addComment.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
              {t("post")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
