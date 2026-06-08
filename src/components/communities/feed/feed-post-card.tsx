"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Heart, MessageSquare, MoreHorizontal, Pin } from "lucide-react";
import { toast } from "sonner";
import { FeedComments } from "./feed-comments";

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

interface FeedPost {
  id: number;
  content: string;
  imageUrl?: string | null;
  authorId: string;
  authorName?: string | null;
  authorImage?: string | null;
  communityId: string;
  likeCount?: number | null;
  commentCount?: number | null;
  isDeleted?: boolean | null;
  isEdited?: boolean | null;
  editedAt?: string | null;
  createdAt: string;
  isPinned?: boolean | null;
  topicSlug?: string | null;
  hasLiked: boolean;
}

interface FeedPostCardProps {
  post: FeedPost;
  currentUserId?: string | null;
  memberRole?: string | null;
  communitySlug: string;
  onRefresh: () => void;
  onToggleComments: (postId: number) => void;
  showComments: boolean;
}

export function FeedPostCard({
  post,
  currentUserId,
  memberRole,
  communitySlug,
  onRefresh,
  onToggleComments,
  showComments,
}: FeedPostCardProps) {
  const t = useTranslations("communities.feed");
  const { requireAuth } = useRequireAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);

  const isAuthor = !!currentUserId && post.authorId === currentUserId;
  const isPrivileged =
    memberRole === "owner" ||
    memberRole === "admin" ||
    memberRole === "moderator";

  const toggleLike = api.feed.toggleLike.useMutation({
    onSuccess: () => onRefresh(),
    onError: () => toast.error("Failed to toggle like"),
  });

  const editPost = api.feed.editPost.useMutation({
    onSuccess: () => {
      toast.success(t("postEdited"));
      setIsEditing(false);
      onRefresh();
    },
    onError: () => toast.error("Failed to update post"),
  });

  const deletePost = api.feed.deletePost.useMutation({
    onSuccess: () => {
      toast.success(t("postDeleted"));
      onRefresh();
    },
    onError: () => toast.error("Failed to delete post"),
  });

  const pinPost = api.feed.pinPost.useMutation({
    onSuccess: () => onRefresh(),
    onError: (e) =>
      toast.error(
        e.message === "PIN_CAP_REACHED" ? t("pinCapReached") : "Failed to pin",
      ),
  });

  if (post.isDeleted) {
    return (
      <div className="border-border rounded-lg border px-4 py-3">
        <p className="text-muted-foreground font-mono text-xs">
          {t("postDeletedMessage")}
        </p>
      </div>
    );
  }

  const initials = (post.authorName ?? "?")[0]?.toUpperCase() ?? "?";

  return (
    <div className="border-border space-y-3 rounded-lg border p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            {post.authorImage ? (
              <AvatarImage src={post.authorImage} alt={post.authorName ?? ""} />
            ) : null}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm leading-tight font-medium">
              {post.authorName ?? "Member"}
            </p>
            <p className="text-muted-foreground flex items-center gap-1 text-[11px]">
              {post.isPinned ? (
                <span className="text-foreground inline-flex items-center gap-0.5">
                  <Pin className="size-3 fill-current" /> {t("pinned")}
                </span>
              ) : null}
              <span>
                {timeAgo(post.createdAt)}
                {post.isEdited ? ` · (${t("edited")})` : ""}
              </span>
            </p>
          </div>
        </div>

        {(isAuthor || isPrivileged) && currentUserId ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7 shrink-0">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isAuthor && (
                <DropdownMenuItem
                  onClick={() => {
                    setEditContent(post.content);
                    setIsEditing(true);
                  }}
                >
                  {t("edit")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  if (confirm(t("deletePostConfirm"))) {
                    deletePost.mutate({ postId: post.id });
                  }
                }}
              >
                {t("delete")}
              </DropdownMenuItem>
              {isPrivileged && (
                <DropdownMenuItem
                  onClick={() =>
                    pinPost.mutate({ postId: post.id, isPinned: !post.isPinned })
                  }
                >
                  {post.isPinned ? t("unpinPost") : t("pinPost")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {/* Content */}
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            maxLength={2000}
            rows={3}
            className="resize-none"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() =>
                editPost.mutate({
                  postId: post.id,
                  content: editContent.trim(),
                })
              }
              disabled={!editContent.trim() || editPost.isPending}
            >
              {t("save")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsEditing(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {post.content}
        </p>
      )}

      {/* Image */}
      {post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt="Post image"
          className="max-h-96 w-full rounded-lg object-cover"
        />
      ) : null}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-1">
        <button
          type="button"
          onClick={() =>
            requireAuth(
              () => toggleLike.mutate({ postId: post.id }),
              "Sign in to like posts",
            )
          }
          className="flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50"
          disabled={toggleLike.isPending}
        >
          <Heart
            className={`size-4 ${post.hasLiked ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
          />
          <span className="text-muted-foreground font-mono text-[11px]">
            {post.likeCount ?? 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onToggleComments(post.id)}
          className="flex items-center gap-1.5 text-sm transition-colors"
        >
          <MessageSquare className="text-muted-foreground size-4" />
          <span className="text-muted-foreground font-mono text-[11px]">
            {post.commentCount ?? 0}
          </span>
        </button>
      </div>

      {/* Comments — part of the same card/thread as the post */}
      {showComments ? (
        <div className="border-border -mx-4 mt-1 border-t px-4 pt-3">
          <FeedComments
            postId={post.id}
            communitySlug={communitySlug}
            currentUserId={currentUserId ?? undefined}
            memberRole={
              memberRole as
                | "owner"
                | "admin"
                | "moderator"
                | "member"
                | null
                | undefined
            }
          />
        </div>
      ) : null}
    </div>
  );
}
