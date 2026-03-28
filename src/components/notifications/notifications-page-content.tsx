"use client";

import { CheckCheckIcon, Trash2Icon, BellOffIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";

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
      <div className="flex items-center justify-between border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / NOTIFICATIONS
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            title="Mark all read"
            onClick={() => markRead.mutate({})}
            disabled={markRead.isPending}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <CheckCheckIcon className="h-3.5 w-3.5" />
            Mark all read
          </button>
          <button
            type="button"
            title="Clear read"
            onClick={() => deleteAllRead.mutate()}
            disabled={deleteAllRead.isPending}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <BellOffIcon className="h-3.5 w-3.5" />
            Clear read
          </button>
          <button
            type="button"
            title="Clear all"
            onClick={() => deleteAll.mutate()}
            disabled={deleteAll.isPending}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
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
          <p className="py-12 text-center text-sm text-muted-foreground">
            No notifications
          </p>
        )}
        {allItems.map((n) => (
          <div
            key={n.id}
            className={`group flex items-start gap-3 rounded-lg border border-border p-4 ${!n.readAt ? "bg-muted/30" : "bg-background"}`}
          >
            {/* Unread dot */}
            <div className="mt-1.5 h-2 w-2 shrink-0">
              {!n.readAt && (
                <span className="block h-2 w-2 rounded-full bg-primary" />
              )}
            </div>

            {/* Full content — no truncation */}
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-medium">{n.title}</p>
              <div className="space-y-1 text-sm text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {n.content}
                </ReactMarkdown>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {new Date(n.createdAt).toLocaleString()}
              </p>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
              {n.readAt ? (
                <button
                  type="button"
                  title="Mark unread"
                  onClick={() => markUnread.mutate({ id: n.id })}
                  disabled={markUnread.isPending}
                  className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  <BellOffIcon className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  title="Mark read"
                  onClick={() => markRead.mutate({ id: n.id })}
                  disabled={markRead.isPending}
                  className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  <CheckCheckIcon className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                title="Delete"
                onClick={() => del.mutate({ id: n.id })}
                disabled={del.isPending}
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <Trash2Icon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {hasNextPage && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full rounded-lg border border-border py-2.5 text-center text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
