"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { toast } from "sonner";
import { Trash2, CornerDownRight } from "lucide-react";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Comment = {
  id: string;
  content: string;
  parentId: string | null;
  createdAt: Date;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
};

type LaunchpadCommentsProps = {
  projectId: number;
  comments: Comment[];
  currentUserId?: string;
};

// ---------------------------------------------------------------------------
// CommentItem
// ---------------------------------------------------------------------------

type CommentItemProps = {
  comment: Comment;
  replies: Comment[];
  projectId: number;
  currentUserId?: string;
};

function CommentItem({
  comment,
  replies,
  projectId,
  currentUserId,
}: CommentItemProps) {
  const t = useTranslations("launchpad.comments");
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const utils = api.useUtils();

  const addCommentMutation = api.launchpad.addComment.useMutation({
    onSuccess: () => {
      setReplyContent("");
      setShowReplyForm(false);
      void utils.launchpad.getBySlug.invalidate();
      toast.success("Reply posted!");
    },
    onError: (err) => {
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error("You must accept the community rules first.");
        return;
      }
      toast.error(err.message);
    },
  });

  const deleteCommentMutation = api.launchpad.deleteComment.useMutation({
    onSuccess: () => {
      void utils.launchpad.getBySlug.invalidate();
      toast.success("Comment deleted.");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const isOwn = currentUserId === comment.authorId;

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
        {/* Author row */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              {comment.authorImage && (
                <AvatarImage
                  src={comment.authorImage}
                  alt={comment.authorName ?? ""}
                />
              )}
              <AvatarFallback className="bg-zinc-200 text-zinc-600 font-mono text-[9px]">
                {getInitials(comment.authorName)}
              </AvatarFallback>
            </Avatar>
            <span className="font-mono text-[9px] font-semibold tracking-wider text-zinc-600">
              {comment.authorName ?? "member"}
            </span>
            <span className="font-mono text-[9px] text-zinc-400">
              &middot;
            </span>
            <span className="font-mono text-[9px] text-zinc-400">
              {timeAgo(comment.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {currentUserId && (
              <button
                onClick={() => setShowReplyForm((v) => !v)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-600"
              >
                <CornerDownRight className="h-2.5 w-2.5" />
                {t("reply")}
              </button>
            )}
            {isOwn && (
              <button
                onClick={() =>
                  deleteCommentMutation.mutate({ commentId: comment.id })
                }
                disabled={deleteCommentMutation.isPending}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 className="h-2.5 w-2.5" />
                {t("delete")}
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <p className="text-sm leading-relaxed text-zinc-700">
          {comment.content}
        </p>
      </div>

      {/* Inline reply form */}
      {showReplyForm && currentUserId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!replyContent.trim()) return;
            addCommentMutation.mutate({
              projectId,
              content: replyContent.trim(),
              parentId: comment.id,
            });
          }}
          className="ml-6 space-y-2 rounded-lg border border-zinc-200 bg-white p-3"
        >
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder={t("placeholder")}
            maxLength={5000}
            rows={2}
            required
            className="w-full resize-none rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-300"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowReplyForm(false);
                setReplyContent("");
              }}
              className="rounded border border-zinc-200 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:bg-zinc-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                addCommentMutation.isPending || !replyContent.trim()
              }
              className="rounded-md bg-zinc-900 px-3 py-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {addCommentMutation.isPending ? "Posting..." : t("reply")}
            </button>
          </div>
        </form>
      )}

      {/* Nested replies */}
      {replies.length > 0 && (
        <div className="ml-6 space-y-2">
          {replies.map((reply) => (
            <div
              key={reply.id}
              className="rounded-lg border border-zinc-100 bg-white p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Avatar size="sm">
                    {reply.authorImage && (
                      <AvatarImage
                        src={reply.authorImage}
                        alt={reply.authorName ?? ""}
                      />
                    )}
                    <AvatarFallback className="bg-zinc-200 text-zinc-600 font-mono text-[9px]">
                      {getInitials(reply.authorName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-mono text-[9px] font-semibold tracking-wider text-zinc-600">
                    {reply.authorName ?? "member"}
                  </span>
                  <span className="font-mono text-[9px] text-zinc-400">
                    &middot;
                  </span>
                  <span className="font-mono text-[9px] text-zinc-400">
                    {timeAgo(reply.createdAt)}
                  </span>
                </div>
                {currentUserId === reply.authorId && (
                  <button
                    onClick={() =>
                      deleteCommentMutation.mutate({ commentId: reply.id })
                    }
                    disabled={deleteCommentMutation.isPending}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                    {t("delete")}
                  </button>
                )}
              </div>
              <p className="text-sm leading-relaxed text-zinc-700">
                {reply.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LaunchpadComments
// ---------------------------------------------------------------------------

export function LaunchpadComments({
  projectId,
  comments,
  currentUserId,
}: LaunchpadCommentsProps) {
  const t = useTranslations("launchpad.comments");
  const { data: session } = authClient.useSession();
  const [newComment, setNewComment] = useState("");
  const utils = api.useUtils();

  const addCommentMutation = api.launchpad.addComment.useMutation({
    onSuccess: () => {
      setNewComment("");
      void utils.launchpad.getBySlug.invalidate();
      toast.success("Comment posted!");
    },
    onError: (err) => {
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error("You must accept the community rules first.");
        return;
      }
      toast.error(err.message);
    },
  });

  // Build threaded structure: top-level comments + their replies
  const topLevel = comments.filter((c) => c.parentId === null);
  const repliesMap = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parentId) {
      const existing = repliesMap.get(c.parentId) ?? [];
      existing.push(c);
      repliesMap.set(c.parentId, existing);
    }
  }

  const isSignedIn = !!session?.user;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <h2 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
        {t("title")}
      </h2>

      {/* New comment form or sign-in prompt */}
      {isSignedIn ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newComment.trim()) return;
            addCommentMutation.mutate({
              projectId,
              content: newComment.trim(),
            });
          }}
          className="space-y-2"
        >
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={t("placeholder")}
            maxLength={5000}
            rows={3}
            required
            className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-300"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={addCommentMutation.isPending || !newComment.trim()}
              className="rounded-md bg-zinc-900 px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {addCommentMutation.isPending ? "Posting..." : t("submit")}
            </button>
          </div>
        </form>
      ) : (
        <p className="font-mono text-[10px] text-zinc-400">
          {t("signInToComment")}
        </p>
      )}

      {/* Comments list */}
      {topLevel.length === 0 ? (
        <p className="py-4 text-center font-mono text-[10px] text-zinc-400">
          {t("noComments")}
        </p>
      ) : (
        <div className="space-y-4">
          {topLevel.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              replies={repliesMap.get(comment.id) ?? []}
              projectId={projectId}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
