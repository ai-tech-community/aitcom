"use client";

import { useEffect, useRef } from "react";
import { CheckCheckIcon, Trash2Icon, BellOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = { onClose: () => void; embedded?: boolean };

type NotificationMetadata = {
  reviewPath?: unknown;
  linkLabel?: unknown;
};

function reviewPathFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const reviewPath = (metadata as NotificationMetadata).reviewPath;
  return typeof reviewPath === "string" && reviewPath.startsWith("/")
    ? reviewPath
    : null;
}

export function NotificationPanel({ onClose, embedded = false }: Props) {
  const tc = useTranslations("common");
  const t = useTranslations("dashboard.notifications");
  const utils = api.useUtils();
  const panelRef = useRef<HTMLDivElement>(null);

  // Fix 3: Stable onClose ref to avoid re-registering listener on every render
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (embedded) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [embedded]);

  // Fix 4: Escape key handler
  useEffect(() => {
    if (embedded) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [embedded]);

  // Fix 1: Destructure isFetchingNextPage
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = api.notifications.list.useInfiniteQuery(
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
  const actionClass =
    embedded &&
    "flex size-11 items-center justify-center focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

  return (
    <div
      ref={panelRef}
      className={
        embedded
          ? "flex min-w-0 flex-col"
          : "border-border bg-background absolute top-10 right-0 z-50 flex w-80 flex-col rounded-lg border shadow-lg sm:w-96"
      }
    >
      {/* Header toolbar */}
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">
            {embedded ? t("title") : "Notifications"}
          </span>
          <Link
            href="/dashboard/notifications"
            onClick={onClose}
            className={cn(
              "text-muted-foreground text-xs underline-offset-4 hover:underline",
              embedded && "flex min-h-11 items-center focus-visible:ring-2",
            )}
          >
            {tc("viewAll")}
          </Link>
        </div>
        <div className="flex gap-1">
          {/* Fix 2: disabled={markRead.isPending} */}
          <button
            type="button"
            title={embedded ? t("markAllRead") : "Mark all read"}
            onClick={() => markRead.mutate({})}
            disabled={markRead.isPending}
            className={cn(
              "text-muted-foreground hover:bg-muted rounded p-1 disabled:opacity-50",
              actionClass,
            )}
          >
            <CheckCheckIcon className="h-4 w-4" />
          </button>
          {/* Fix 2: disabled={deleteAllRead.isPending} */}
          <button
            type="button"
            title={embedded ? t("clearRead") : "Clear read"}
            onClick={() => deleteAllRead.mutate()}
            disabled={deleteAllRead.isPending}
            className={cn(
              "text-muted-foreground hover:bg-muted rounded p-1 disabled:opacity-50",
              actionClass,
            )}
          >
            <BellOffIcon className="h-4 w-4" />
          </button>
          {/* Fix 2: disabled={deleteAll.isPending} */}
          <button
            type="button"
            title={embedded ? t("clearAll") : "Clear all"}
            onClick={() => deleteAll.mutate()}
            disabled={deleteAll.isPending}
            className={cn(
              "text-muted-foreground hover:bg-muted rounded p-1 disabled:opacity-50",
              actionClass,
            )}
          >
            <Trash2Icon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* List */}
      <div
        className={cn(
          "max-h-96 overflow-y-auto",
          embedded && "max-h-[min(24rem,55dvh)]",
        )}
      >
        {isLoading &&
          (embedded ? (
            <div
              role="status"
              aria-label={tc("loading")}
              className="space-y-3 p-4"
            >
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ))}
        {embedded && isError && allItems.length === 0 ? (
          <div role="status" className="p-4 text-sm">
            <p>{tc("errorTitle")}</p>
            <button
              type="button"
              className="min-h-11 underline focus-visible:ring-2"
              onClick={() => void refetch()}
            >
              {tc("retry")}
            </button>
          </div>
        ) : null}
        {!isLoading && (!embedded || !isError) && allItems.length === 0 && (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            {embedded ? t("emptyTitle") : "No notifications"}
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
                  <span
                    className={cn(
                      "bg-primary block h-2 w-2 rounded-full",
                      embedded && "bg-foreground",
                    )}
                  />
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className={cn(
                    "w-full text-left",
                    embedded && "min-h-11 focus-visible:ring-2",
                  )}
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
                  <p className="text-muted-foreground mt-1 text-xs">
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
                    className={cn(
                      "text-primary mt-2 inline-block text-xs font-medium underline-offset-4 hover:underline",
                      embedded &&
                        "text-foreground inline-flex min-h-11 items-center underline focus-visible:ring-2",
                    )}
                  >
                    {typeof (n.metadata as NotificationMetadata)?.linkLabel ===
                    "string"
                      ? ((n.metadata as NotificationMetadata)
                          .linkLabel as string)
                      : embedded
                        ? t("reviewSuggestion")
                        : "Review suggestion"}
                  </Link>
                )}
              </div>

              {/* Per-row actions */}
              <div
                className={cn(
                  "flex shrink-0 flex-col gap-1 opacity-0 group-hover:opacity-100",
                  embedded && "opacity-100",
                )}
              >
                {n.readAt ? (
                  /* Fix 2: disabled={markUnread.isPending} */
                  <button
                    type="button"
                    title={embedded ? t("markUnread") : "Mark unread"}
                    onClick={() => markUnread.mutate({ id: n.id })}
                    disabled={markUnread.isPending}
                    className={cn(
                      "text-muted-foreground hover:bg-muted rounded p-0.5 disabled:opacity-50",
                      actionClass,
                    )}
                  >
                    <BellOffIcon className="h-3 w-3" />
                  </button>
                ) : (
                  /* Fix 2: disabled={markRead.isPending} */
                  <button
                    type="button"
                    title={embedded ? t("markRead") : "Mark read"}
                    onClick={() => markRead.mutate({ id: n.id })}
                    disabled={markRead.isPending}
                    className={cn(
                      "text-muted-foreground hover:bg-muted rounded p-0.5 disabled:opacity-50",
                      actionClass,
                    )}
                  >
                    <CheckCheckIcon className="h-3 w-3" />
                  </button>
                )}
                {/* Fix 2: disabled={del.isPending} */}
                <button
                  type="button"
                  title={embedded ? t("delete") : "Delete"}
                  onClick={() => del.mutate({ id: n.id })}
                  disabled={del.isPending}
                  className={cn(
                    "text-muted-foreground hover:bg-muted rounded p-0.5 disabled:opacity-50",
                    actionClass,
                  )}
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
            className={cn(
              "text-muted-foreground hover:bg-muted w-full py-2 text-center text-xs disabled:opacity-50",
              embedded && "min-h-11 focus-visible:ring-2",
            )}
          >
            {isFetchingNextPage ? tc("loading") : tc("loadMore")}
          </button>
        )}
      </div>
    </div>
  );
}
