"use client";

import { CheckCheckIcon, Trash2Icon, BellOffIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";

type NotificationMetadata = {
  reviewPath?: unknown;
};

function reviewPathFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const reviewPath = (metadata as NotificationMetadata).reviewPath;
  return typeof reviewPath === "string" && reviewPath.startsWith("/")
    ? reviewPath
    : null;
}

export function NotificationsPageContent() {
  const utils = api.useUtils();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    api.notifications.list.useInfiniteQuery(
      { limit: 30 },
      {
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        initialCursor: null,
      },
    );

  const markRead = api.notifications.markRead.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
    },
  });

  const markUnread = api.notifications.markUnread.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
    },
  });

  const del = api.notifications.delete.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
    },
  });

  const deleteAll = api.notifications.deleteAll.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
    },
  });

  const deleteAllRead = api.notifications.deleteAllRead.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
    },
  });

  const allItems = data?.pages.flatMap((p) => p.notifications) ?? [];

  return (
    <div>
      {/* Header */}
      <div className="border-border flex items-center justify-between border-b pb-4">
        <SectionLabel bordered={false}>NOTIFICATIONS</SectionLabel>
        <div className="flex gap-2">
          <button
            type="button"
            title="Mark all read"
            onClick={() => markRead.mutate({})}
            disabled={markRead.isPending}
            className="border-border text-muted-foreground hover:bg-muted flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <CheckCheckIcon className="h-3.5 w-3.5" />
            Mark all read
          </button>
          <button
            type="button"
            title="Clear read"
            onClick={() => deleteAllRead.mutate()}
            disabled={deleteAllRead.isPending}
            className="border-border text-muted-foreground hover:bg-muted flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <BellOffIcon className="h-3.5 w-3.5" />
            Clear read
          </button>
          <button
            type="button"
            title="Clear all"
            onClick={() => deleteAll.mutate()}
            disabled={deleteAll.isPending}
            className="border-border text-muted-foreground hover:bg-muted flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <Trash2Icon className="h-3.5 w-3.5" />
            Clear all
          </button>
        </div>
      </div>

      {/* List */}
      <div className="mt-4 space-y-3">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )}
        {!isLoading && allItems.length === 0 && (
          <p className="text-muted-foreground py-12 text-center text-sm">
            No notifications
          </p>
        )}
        {allItems.map((n) => {
          const reviewPath = reviewPathFromMetadata(n.metadata);

          return (
            <div
              key={n.id}
              className={`group border-border flex items-start gap-3 rounded-lg border p-4 ${!n.readAt ? "bg-muted/30" : "bg-background"}`}
            >
              {/* Unread dot */}
              <div className="mt-1.5 h-2 w-2 shrink-0">
                {!n.readAt && (
                  <span className="bg-primary block h-2 w-2 rounded-full" />
                )}
              </div>

              {/* Full content — no truncation */}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium">{n.title}</p>
                <div className="text-muted-foreground [&_strong]:text-foreground [&_a]:text-primary space-y-1 text-sm [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:leading-relaxed [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {n.content}
                  </ReactMarkdown>
                </div>
                <p className="text-muted-foreground text-[10px]">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
                {reviewPath && (
                  <Link
                    href={reviewPath}
                    onClick={() => !n.readAt && markRead.mutate({ id: n.id })}
                    className="text-primary inline-block text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Review suggestion
                  </Link>
                )}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
                {n.readAt ? (
                  <button
                    type="button"
                    title="Mark unread"
                    onClick={() => markUnread.mutate({ id: n.id })}
                    disabled={markUnread.isPending}
                    className="text-muted-foreground hover:bg-muted rounded p-1 disabled:opacity-50"
                  >
                    <BellOffIcon className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    title="Mark read"
                    onClick={() => markRead.mutate({ id: n.id })}
                    disabled={markRead.isPending}
                    className="text-muted-foreground hover:bg-muted rounded p-1 disabled:opacity-50"
                  >
                    <CheckCheckIcon className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  title="Delete"
                  onClick={() => del.mutate({ id: n.id })}
                  disabled={del.isPending}
                  className="text-muted-foreground hover:bg-muted rounded p-1 disabled:opacity-50"
                >
                  <Trash2Icon className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}

        {hasNextPage && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="border-border text-muted-foreground hover:bg-muted w-full rounded-lg border py-2.5 text-center text-xs disabled:opacity-50"
          >
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
