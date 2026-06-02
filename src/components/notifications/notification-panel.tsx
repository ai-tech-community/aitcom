"use client";

import { useEffect, useRef } from "react";
import { CheckCheckIcon, Trash2Icon, BellOffIcon } from "lucide-react";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";

type Props = { onClose: () => void };

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

export function NotificationPanel({ onClose }: Props) {
  const utils = api.useUtils();
  const panelRef = useRef<HTMLDivElement>(null);

  // Fix 3: Stable onClose ref to avoid re-registering listener on every render
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fix 4: Escape key handler
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Fix 1: Destructure isFetchingNextPage
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    api.notifications.list.useInfiniteQuery(
      { limit: 20 },
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
    <div
      ref={panelRef}
      className="border-border bg-background absolute top-10 right-0 z-50 flex w-80 flex-col rounded-lg border shadow-lg sm:w-96"
    >
      {/* Header toolbar */}
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Notifications</span>
          <Link
            href="/dashboard/notifications"
            onClick={onClose}
            className="text-muted-foreground text-[10px] underline-offset-4 hover:underline"
          >
            View all
          </Link>
        </div>
        <div className="flex gap-1">
          {/* Fix 2: disabled={markRead.isPending} */}
          <button
            type="button"
            title="Mark all read"
            onClick={() => markRead.mutate({})}
            disabled={markRead.isPending}
            className="text-muted-foreground hover:bg-muted rounded p-1 disabled:opacity-50"
          >
            <CheckCheckIcon className="h-4 w-4" />
          </button>
          {/* Fix 2: disabled={deleteAllRead.isPending} */}
          <button
            type="button"
            title="Clear read"
            onClick={() => deleteAllRead.mutate()}
            disabled={deleteAllRead.isPending}
            className="text-muted-foreground hover:bg-muted rounded p-1 disabled:opacity-50"
          >
            <BellOffIcon className="h-4 w-4" />
          </button>
          {/* Fix 2: disabled={deleteAll.isPending} */}
          <button
            type="button"
            title="Clear all"
            onClick={() => deleteAll.mutate()}
            disabled={deleteAll.isPending}
            className="text-muted-foreground hover:bg-muted rounded p-1 disabled:opacity-50"
          >
            <Trash2Icon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto">
        {isLoading && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {!isLoading && allItems.length === 0 && (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            No notifications
          </p>
        )}
        {allItems.map((n) => {
          const reviewPath = reviewPathFromMetadata(n.metadata);

          return (
            <div
              key={n.id}
              className="group border-border hover:bg-muted/50 flex items-start gap-2 border-b px-3 py-3 last:border-0"
            >
              {/* Unread dot */}
              <div className="mt-1.5 h-2 w-2 shrink-0">
                {!n.readAt && (
                  <span className="bg-primary block h-2 w-2 rounded-full" />
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => !n.readAt && markRead.mutate({ id: n.id })}
                >
                  <p className="truncate text-sm font-medium">{n.title}</p>
                  <p className="text-muted-foreground line-clamp-2 text-xs">
                    {n.content
                      .replace(/\*\*(.*?)\*\*/g, "$1")
                      .replace(/\*(.*?)\*/g, "$1")
                      .replace(/^[-*]\s/gm, "")
                      .replace(/#{1,6}\s/g, "")}
                  </p>
                  <p className="text-muted-foreground mt-1 text-[10px]">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </p>
                </button>
                {reviewPath && (
                  <Link
                    href={reviewPath}
                    onClick={() => {
                      if (!n.readAt) markRead.mutate({ id: n.id });
                      onClose();
                    }}
                    className="text-primary mt-2 inline-block text-xs font-medium underline-offset-4 hover:underline"
                  >
                    Review suggestion
                  </Link>
                )}
              </div>

              {/* Per-row actions */}
              <div className="flex shrink-0 flex-col gap-1 opacity-0 group-hover:opacity-100">
                {n.readAt ? (
                  /* Fix 2: disabled={markUnread.isPending} */
                  <button
                    type="button"
                    title="Mark unread"
                    onClick={() => markUnread.mutate({ id: n.id })}
                    disabled={markUnread.isPending}
                    className="text-muted-foreground hover:bg-muted rounded p-0.5 disabled:opacity-50"
                  >
                    <BellOffIcon className="h-3 w-3" />
                  </button>
                ) : (
                  /* Fix 2: disabled={markRead.isPending} */
                  <button
                    type="button"
                    title="Mark read"
                    onClick={() => markRead.mutate({ id: n.id })}
                    disabled={markRead.isPending}
                    className="text-muted-foreground hover:bg-muted rounded p-0.5 disabled:opacity-50"
                  >
                    <CheckCheckIcon className="h-3 w-3" />
                  </button>
                )}
                {/* Fix 2: disabled={del.isPending} */}
                <button
                  type="button"
                  title="Delete"
                  onClick={() => del.mutate({ id: n.id })}
                  disabled={del.isPending}
                  className="text-muted-foreground hover:bg-muted rounded p-0.5 disabled:opacity-50"
                >
                  <Trash2Icon className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Fix 1: isFetchingNextPage state on Load more button */}
        {hasNextPage && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="text-muted-foreground hover:bg-muted w-full py-2 text-center text-xs disabled:opacity-50"
          >
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
