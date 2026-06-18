"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { LexicalRenderer } from "@/lib/lexical";
import { RoleBadge } from "@/components/forum/role-badge";
import { ReplyList } from "@/components/forum/reply-list";
import { ReplyForm } from "@/components/forum/reply-form";
import { authClient } from "@/server/better-auth/client";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { SectionLabel } from "@/components/ui/section-label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ThreadDetailProps = {
  slug: string;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
  communitySlug?: string;
};

export function ThreadDetail({
  slug,
  memberRole,
  communitySlug,
}: ThreadDetailProps) {
  const backHref = (
    communitySlug ? `/communities/${communitySlug}/forum` : "/forum"
  ) as never;
  const t = useTranslations("forum");
  const viewCountedRef = useRef(false);
  const utils = api.useUtils();
  const canModerate =
    memberRole === "owner" ||
    memberRole === "admin" ||
    memberRole === "moderator";

  const { data: session } = authClient.useSession();

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const { data: thread, isLoading: threadLoading } =
    api.forum.getThread.useQuery({ slug });

  const { data: replies = [], isLoading: repliesLoading } =
    api.forum.getReplies.useQuery(
      { threadId: thread?.id ?? 0 },
      { enabled: !!thread },
    );

  const incrementView = api.forum.incrementViewCount.useMutation();

  const pinMutation = api.forum.pinThread.useMutation({
    onSuccess: () => void utils.forum.getThread.invalidate({ slug }),
  });

  const lockMutation = api.forum.lockThread.useMutation({
    onSuccess: () => void utils.forum.getThread.invalidate({ slug }),
  });

  const editMutation = api.forum.editThread.useMutation({
    onSuccess: () => {
      toast.success(t("threadEdited"));
      setIsEditing(false);
      void utils.forum.getThread.invalidate({ slug });
    },
  });

  const deleteMutation = api.forum.deleteThread.useMutation({
    onSuccess: () => {
      toast.success(t("threadDeleted"));
      void utils.forum.getThread.invalidate({ slug });
    },
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
          href={backHref}
          className="font-mono text-xs tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-1 inline h-3 w-3" />
          {t("backToForum")}
        </Link>
        <div className="mt-8 space-y-3">
          <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-32 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  // Thread not found (should not happen due to server-side check, but just in case)
  if (!thread) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-6 sm:px-12 sm:py-8">
        <Link
          href={backHref}
          className="font-mono text-xs tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("backToForum")}
        </Link>
        <p className="mt-8 font-mono text-xs text-muted-foreground">
          Thread not found.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 sm:px-12 sm:py-8">
      {/* Back link */}
      <Link
        href={backHref}
        className="font-mono text-xs tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        {t("backToForum")}
      </Link>

      {/* Thread header */}
      <div className="mt-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
          {thread.isPinned && (
            <span className="mr-1.5 font-mono text-[9px] font-semibold text-orange-600">
              {t("pinned").toUpperCase()}
            </span>
          )}
          {thread.title}
        </h1>
        <div className="mt-2 flex items-center gap-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
          {/* Post type is categorical, not a status → neutral Badge. */}
          <Badge
            variant="secondary"
            className="rounded px-1.5 py-0.5 font-semibold"
          >
            {t(thread.category)}
          </Badge>
          <span>&middot;</span>
          {thread.createdAt && <RelativeTime date={thread.createdAt} />}
          {thread.isEdited && (
            <span className="text-muted-foreground italic">({t("edited")})</span>
          )}
          {thread.authorName && (
            <>
              <span>&middot;</span>
              <span className="normal-case">{thread.authorName}</span>
              <RoleBadge role={thread.authorRole} />
            </>
          )}
        </div>

        {/* Actions menu */}
        {(canModerate || isAuthor) && !thread.isDeleted && (
          <div className="mt-3">
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded border border-border px-2 py-1 font-mono text-[9px] font-semibold tracking-wider text-muted-foreground uppercase hover:bg-accent">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {canModerate && (
                  <>
                    <DropdownMenuItem
                      onClick={() =>
                        pinMutation.mutate({
                          threadId: thread.id,
                          isPinned: !thread.isPinned,
                        })
                      }
                    >
                      {thread.isPinned ? t("unpinThread") : t("pinThread")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        lockMutation.mutate({
                          threadId: thread.id,
                          isLocked: !thread.isLocked,
                        })
                      }
                    >
                      {thread.isLocked ? t("unlockThread") : t("lockThread")}
                    </DropdownMenuItem>
                  </>
                )}
                {isAuthor && (
                  <DropdownMenuItem
                    onClick={() => {
                      setEditTitle(thread.title);
                      setEditContent("");
                      setIsEditing(true);
                    }}
                  >
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    {t("edit")}
                  </DropdownMenuItem>
                )}
                {(isAuthor || canModerate) && (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                      if (window.confirm(t("deleteThreadConfirm")))
                        deleteMutation.mutate({ threadId: thread.id });
                    }}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    {t("delete")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {thread.isLocked && (
        <div className="bg-warning/15 text-warning mt-4 rounded-lg p-3 text-center text-sm">
          {t("threadLocked")}
        </div>
      )}

      {/* Thread content */}
      {thread.isDeleted ? (
        <div className="mt-6 rounded-lg border border-border bg-muted p-5 text-center text-sm text-muted-foreground italic">
          {t("threadDeletedMessage")}
        </div>
      ) : isEditing ? (
        <div className="mt-6 space-y-3">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm font-medium"
          />
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() =>
                editMutation.mutate({
                  threadId: thread.id,
                  title: editTitle,
                  content: editContent,
                })
              }
              disabled={editMutation.isPending}
              className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-xs font-semibold"
            >
              {t("save")}
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="rounded-md border px-4 py-1.5 text-xs"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-border bg-card p-5 text-sm leading-relaxed text-foreground">
          <LexicalRenderer content={thread.content} />
        </div>
      )}

      {/* Divider */}
      <div className="my-8 border-t border-border" />

      {/* Replies section */}
      <SectionLabel bordered={false} className="mb-4">
        {t("replies", { count: replies.length })}
      </SectionLabel>

      {repliesLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : (
        <ReplyList
          replies={replies}
          currentUserId={session?.user?.id}
          memberRole={memberRole}
          threadSlug={slug}
        />
      )}

      {/* Reply form */}
      <ReplyForm threadId={thread.id} isLocked={thread.isLocked ?? false} />
    </div>
  );
}
