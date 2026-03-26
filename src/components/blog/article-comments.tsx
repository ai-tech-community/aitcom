"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { toast } from "sonner";
import { Trash2, CornerDownRight } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Link } from "@/i18n/navigation";
import { useRulesModal } from "@/components/community/rules-provider";

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
  id: number;
  content: string;
  parentId: number | null;
  createdAt: string;
  authorId: string;
  authorName: string | null;
};

type ArticleCommentsProps = {
  articleId: number;
  initialComments: Comment[];
  currentUserId?: string;
};

// ---------------------------------------------------------------------------
// CommentForm
// ---------------------------------------------------------------------------

function CommentForm({
  articleId,
  parentId,
  placeholder,
  onSuccess,
  onCancel,
  onRulesRequired,
}: {
  articleId: number;
  parentId?: number;
  placeholder: string;
  onSuccess: () => void;
  onCancel?: () => void;
  onRulesRequired: () => void;
}) {
  const t = useTranslations("blog.comments");
  const [content, setContent] = useState("");
  const utils = api.useUtils();

  const createMutation = api.comments.create.useMutation({
    onSuccess: () => {
      setContent("");
      void utils.comments.list.invalidate({ articleId });
      toast.success(t("toast.posted"));
      onSuccess();
    },
    onError: (err) => {
      if (err.message === "RULES_NOT_ACCEPTED") {
        onRulesRequired();
        return;
      }
      toast.error(t("toast.error"));
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!content.trim()) return;
        createMutation.mutate({
          articleId,
          content: content.trim(),
          parentId,
        });
      }}
      className="space-y-2"
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        maxLength={5000}
        rows={parentId ? 2 : 3}
        required
        className="border-border bg-transparent text-foreground placeholder:text-muted-foreground w-full resize-none rounded border px-3 py-2 font-mono text-sm outline-none focus:ring-1 focus:ring-current"
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground rounded border border-transparent px-2 py-1 font-mono text-[10px] tracking-wider transition-colors"
          >
            {t("cancel")}
          </button>
        )}
        <button
          type="submit"
          disabled={createMutation.isPending || !content.trim()}
          className="bg-foreground text-background hover:bg-foreground/90 rounded px-3 py-1 font-mono text-[10px] tracking-wider transition-colors disabled:opacity-50"
        >
          {createMutation.isPending ? "..." : t("submit")}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// CommentItem
// ---------------------------------------------------------------------------

function CommentItem({
  comment,
  replies,
  articleId,
  currentUserId,
  onRulesRequired,
}: {
  comment: Comment;
  replies: Comment[];
  articleId: number;
  currentUserId?: string;
  onRulesRequired: () => void;
}) {
  const t = useTranslations("blog.comments");
  const [showReplyForm, setShowReplyForm] = useState(false);
  const utils = api.useUtils();

  const deleteMutation = api.comments.delete.useMutation({
    onSuccess: () => {
      void utils.comments.list.invalidate({ articleId });
      toast.success(t("toast.deleted"));
    },
    onError: () => {
      toast.error(t("toast.error"));
    },
  });

  const isOwn = currentUserId === comment.authorId;

  return (
    <div className="space-y-2">
      {/* Comment */}
      <div className="border-border rounded border p-3">
        {/* Author row */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback className="bg-muted text-muted-foreground font-mono text-[9px]">
                {getInitials(comment.authorName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-muted-foreground font-mono text-[10px] font-semibold tracking-wider">
              {comment.authorName ?? "member"}
            </span>
            <span className="text-muted-foreground/50 font-mono text-[10px]">
              &middot;
            </span>
            <span className="text-muted-foreground/50 font-mono text-[10px]">
              {timeAgo(comment.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {currentUserId && (
              <button
                onClick={() => setShowReplyForm((v) => !v)}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] tracking-wider transition-colors"
              >
                <CornerDownRight className="h-2.5 w-2.5" />
                {t("reply")}
              </button>
            )}
            {isOwn && (
              <button
                onClick={() => {
                  if (window.confirm(t("deleteConfirm"))) {
                    deleteMutation.mutate({ commentId: comment.id });
                  }
                }}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-red-400 transition-colors hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 className="h-2.5 w-2.5" />
                {t("delete")}
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <p className="text-foreground text-sm leading-relaxed">
          {comment.content}
        </p>
      </div>

      {/* Inline reply form */}
      {showReplyForm && currentUserId && (
        <div className="border-border ml-8 border-l-2 pl-4">
          <CommentForm
            articleId={articleId}
            parentId={comment.id}
            placeholder={t("replyPlaceholder")}
            onSuccess={() => setShowReplyForm(false)}
            onCancel={() => {
              setShowReplyForm(false);
            }}
            onRulesRequired={onRulesRequired}
          />
        </div>
      )}

      {/* Nested replies */}
      {replies.length > 0 && (
        <div className="border-border ml-8 space-y-2 border-l-2 pl-4">
          {replies.map((reply) => (
            <div key={reply.id} className="border-border rounded border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Avatar size="sm">
                    <AvatarFallback className="bg-muted text-muted-foreground font-mono text-[9px]">
                      {getInitials(reply.authorName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-muted-foreground font-mono text-[10px] font-semibold tracking-wider">
                    {reply.authorName ?? "member"}
                  </span>
                  <span className="text-muted-foreground/50 font-mono text-[10px]">
                    &middot;
                  </span>
                  <span className="text-muted-foreground/50 font-mono text-[10px]">
                    {timeAgo(reply.createdAt)}
                  </span>
                </div>
                {currentUserId === reply.authorId && (
                  <button
                    onClick={() => {
                      if (window.confirm(t("deleteConfirm"))) {
                        deleteMutation.mutate({ commentId: reply.id });
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-red-400 transition-colors hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                    {t("delete")}
                  </button>
                )}
              </div>
              <p className="text-foreground text-sm leading-relaxed">
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
// ArticleComments (exported)
// ---------------------------------------------------------------------------

export function ArticleComments({
  articleId,
  initialComments,
  currentUserId,
}: ArticleCommentsProps) {
  const t = useTranslations("blog.comments");
  const { data: session } = authClient.useSession();
  const { openRulesModal } = useRulesModal();

  const { data: comments } = api.comments.list.useQuery(
    { articleId },
    { initialData: initialComments },
  );

  // Build threaded structure
  const topLevel = (comments ?? []).filter((c) => c.parentId === null);
  const repliesMap = new Map<number, Comment[]>();
  for (const c of comments ?? []) {
    if (c.parentId) {
      const existing = repliesMap.get(c.parentId) ?? [];
      existing.push(c);
      repliesMap.set(c.parentId, existing);
    }
  }

  const isSignedIn = !!session?.user;

  return (
    <div className="mt-8 space-y-4">
      {/* Section header */}
      <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
        / {t("title")}
      </h2>

      {/* New comment form or signin prompt */}
      {isSignedIn ? (
        <CommentForm
          articleId={articleId}
          placeholder={t("placeholder")}
          onSuccess={() => undefined}
          onRulesRequired={openRulesModal}
        />
      ) : (
        <p className="text-muted-foreground font-mono text-xs">
          <Link href="/signin" className="hover:text-foreground underline transition-colors">
            {t("signIn")}
          </Link>
        </p>
      )}

      {/* Comments list */}
      {topLevel.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center font-mono text-xs">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-4">
          {topLevel.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              replies={repliesMap.get(comment.id) ?? []}
              articleId={articleId}
              currentUserId={currentUserId}
              onRulesRequired={openRulesModal}
            />
          ))}
        </div>
      )}
    </div>
  );
}
