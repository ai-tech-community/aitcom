"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Link } from "@/i18n/navigation";
import { LexicalRenderer } from "@/lib/lexical";
import { RoleBadge } from "@/components/forum/role-badge";
import { ReplyList } from "@/components/forum/reply-list";
import { ReplyForm } from "@/components/forum/reply-form";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const categoryStyles: Record<string, string> = {
  general: "text-zinc-500 border-zinc-200",
  question: "text-blue-600 border-blue-200 bg-blue-50",
  showcase: "text-purple-600 border-purple-200 bg-purple-50",
  job: "text-green-600 border-green-200 bg-green-50",
};

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

type ThreadDetailProps = {
  slug: string;
};

export function ThreadDetail({ slug }: ThreadDetailProps) {
  const t = useTranslations("forum");
  const viewCountedRef = useRef(false);
  const { data: session } = authClient.useSession();
  const utils = api.useUtils();

  const { data: thread, isLoading: threadLoading } =
    api.community.getThread.useQuery({ slug });

  const { data: replies = [], isLoading: repliesLoading } =
    api.community.getReplies.useQuery(
      { threadId: thread?.id ?? 0 },
      { enabled: !!thread },
    );

  const incrementView = api.community.incrementViewCount.useMutation();

  const pinMutation = api.community.pinThread.useMutation({
    onSuccess: () => void utils.community.getThread.invalidate({ slug }),
  });

  const lockMutation = api.community.lockThread.useMutation({
    onSuccess: () => void utils.community.getThread.invalidate({ slug }),
  });

  const isAuthor = !!(
    session?.user?.id &&
    thread?.authorId &&
    session.user.id === thread.authorId
  );

  // Increment view count once on mount when thread loads
  useEffect(() => {
    if (thread && !viewCountedRef.current) {
      viewCountedRef.current = true;
      incrementView.mutate({ threadId: thread.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id]);

  // Loading state
  if (threadLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-6 sm:px-12 sm:py-8">
        <Link
          href="/forum"
          className="font-mono text-xs tracking-wider text-zinc-400 transition-colors hover:text-zinc-600"
        >
          <ArrowLeft className="mr-1 inline h-3 w-3" />
          {t("backToForum")}
        </Link>
        <div className="mt-8 space-y-3">
          <div className="h-6 w-2/3 animate-pulse rounded bg-zinc-100" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-100" />
          <div className="mt-4 h-32 animate-pulse rounded-lg bg-zinc-100" />
        </div>
      </div>
    );
  }

  // Thread not found (should not happen due to server-side check, but just in case)
  if (!thread) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-6 sm:px-12 sm:py-8">
        <Link
          href="/forum"
          className="font-mono text-xs tracking-wider text-zinc-400 transition-colors hover:text-zinc-600"
        >
          {t("backToForum")}
        </Link>
        <p className="mt-8 font-mono text-xs text-zinc-400">
          Thread not found.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 sm:px-12 sm:py-8">
      {/* Back link */}
      <Link
        href="/forum"
        className="font-mono text-xs tracking-wider text-zinc-400 transition-colors hover:text-zinc-600"
      >
         {t("backToForum")}
      </Link>

      {/* Thread header */}
      <div className="mt-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">
          {thread.isPinned && (
            <span className="mr-1.5 font-mono text-[9px] font-semibold text-orange-600">
              {t("pinned").toUpperCase()}
            </span>
          )}
          {thread.title}
        </h1>
        <div className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
          <span
            className={`rounded border px-1.5 py-0.5 font-semibold ${categoryStyles[thread.category] ?? categoryStyles.general}`}
          >
            {t(thread.category)}
          </span>
          <span>&middot;</span>
          <span>{timeAgo(thread.createdAt)}</span>
          {thread.authorName && (
            <>
              <span>&middot;</span>
              <span className="normal-case">{thread.authorName}</span>
              <RoleBadge role={thread.authorRole} />
            </>
          )}
        </div>

        {/* Admin actions */}
        {isAuthor && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() =>
                pinMutation.mutate({
                  threadId: thread.id,
                  isPinned: !thread.isPinned,
                })
              }
              className="rounded border border-zinc-200 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:bg-zinc-100"
            >
              {thread.isPinned ? t("unpinThread") : t("pinThread")}
            </button>
            <button
              onClick={() =>
                lockMutation.mutate({
                  threadId: thread.id,
                  isLocked: !thread.isLocked,
                })
              }
              className="rounded border border-zinc-200 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:bg-zinc-100"
            >
              {thread.isLocked ? t("unlockThread") : t("lockThread")}
            </button>
          </div>
        )}
      </div>

      {/* Thread content */}
      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 text-sm leading-relaxed text-zinc-700">
        <LexicalRenderer content={thread.content} />
      </div>

      {/* Divider */}
      <div className="my-8 border-t border-zinc-200" />

      {/* Replies section */}
      <h2 className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
        {t("replies", { count: replies.length })}
      </h2>

      {repliesLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg bg-zinc-100"
            />
          ))}
        </div>
      ) : (
        <ReplyList replies={replies} />
      )}

      {/* Reply form */}
      <ReplyForm threadId={thread.id} isLocked={thread.isLocked ?? false} />
    </div>
  );
}
