"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { toast } from "sonner";
import { Trash2, CornerDownRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { RelativeTime } from "@/components/ui/relative-time";
import { SectionLabel } from "@/components/ui/section-label";
import { getInitials } from "@/lib/avatar";

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
      <div className="rounded-lg border border-border bg-muted p-3">
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
              <AvatarFallback className="font-mono text-xs">
                {getInitials(comment.authorName ?? "")}
              </AvatarFallback>
            </Avatar>
            <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">
              {comment.authorName ?? "member"}
            </span>
            <span className="font-mono text-xs text-muted-foreground">&middot;</span>
            <RelativeTime
              date={comment.createdAt}
              className="text-xs text-muted-foreground"
            />

          </div>
          <div className="flex items-center gap-1">
            {currentUserId && (
              <button
                onClick={() => setShowReplyForm((v) => !v)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase transition-colors hover:bg-accent hover:text-foreground"
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
                className="text-destructive hover:bg-destructive/15 flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider uppercase transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-2.5 w-2.5" />
                {t("delete")}
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <p className="text-sm leading-relaxed text-foreground">
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
          className="ml-6 space-y-2 rounded-lg border border-border bg-card p-3"
        >
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder={t("placeholder")}
            maxLength={5000}
            rows={2}
            required
            className="w-full resize-none rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowReplyForm(false);
                setReplyContent("");
              }}
              className="rounded border border-border px-2 py-1 font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addCommentMutation.isPending || !replyContent.trim()}
              className="rounded-md bg-foreground px-3 py-1 font-mono text-xs font-semibold tracking-widest text-background uppercase transition-colors hover:bg-foreground/90 disabled:opacity-50"
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
              className="rounded-lg border border-border bg-card p-3"
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
                    <AvatarFallback className="font-mono text-xs">
                      {getInitials(reply.authorName ?? "")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">
                    {reply.authorName ?? "member"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    &middot;
                  </span>
                  <RelativeTime
                    date={reply.createdAt}
                    className="text-xs text-muted-foreground"
                  />
                </div>
                {currentUserId === reply.authorId && (
                  <button
                    onClick={() =>
                      deleteCommentMutation.mutate({ commentId: reply.id })
                    }
                    disabled={deleteCommentMutation.isPending}
                    className="text-destructive hover:bg-destructive/15 flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider uppercase transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                    {t("delete")}
                  </button>
                )}
              </div>
              <p className="text-sm leading-relaxed text-foreground">
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
      <SectionLabel bordered={false}>{t("title")}</SectionLabel>

      {/* New comment form or signin prompt */}
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
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={addCommentMutation.isPending || !newComment.trim()}
              className="rounded-md bg-foreground px-4 py-1.5 font-mono text-xs font-semibold tracking-widest text-background uppercase transition-colors hover:bg-foreground/90 disabled:opacity-50"
            >
              {addCommentMutation.isPending ? "Posting..." : t("submit")}
            </button>
          </div>
        </form>
      ) : (
        <p className="font-mono text-xs text-muted-foreground">
          {t("signInToComment")}
        </p>
      )}

      {/* Comments list */}
      {topLevel.length === 0 ? (
        <p className="py-4 text-center font-mono text-xs text-muted-foreground">
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
