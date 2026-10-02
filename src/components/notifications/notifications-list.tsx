"use client";

import * as React from "react";
import { BellDot, BellOffIcon, CheckCheckIcon, Trash2Icon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api, type RouterOutputs } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadMore } from "@/components/ui/load-more";
import { RelativeTime } from "@/components/ui/relative-time";
import { ArrowLink } from "@/components/dashboard/arrow-link";
import {
  DashboardSection,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { ListSkeleton } from "@/components/dashboard/list-skeleton";

import { NOTIFICATIONS_PAGE_SIZE } from "./notifications-query";

type Notification =
  RouterOutputs["notifications"]["list"]["notifications"][number];

type NotificationMetadata = {
  reviewPath?: unknown;
};

export function reviewPathFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const reviewPath = (metadata as NotificationMetadata).reviewPath;
  return typeof reviewPath === "string" && reviewPath.startsWith("/")
    ? reviewPath
    : null;
}

/** What a row can do; each one is a plain call into the list's mutations. */
type RowActions = {
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  remove: (id: string) => void;
  pending: boolean;
};

/**
 * One notification. Unread is shown by weight and a "New" label with an
 * icon, not by colour alone. The row actions show on hover, whenever focus
 * is inside the row, and always on touch screens (no hover there).
 */
function NotificationRow({
  notification: n,
  actions,
}: {
  notification: Notification;
  actions: RowActions;
}) {
  const t = useTranslations("dashboard.notifications");
  const titleId = React.useId();
  const unread = !n.readAt;
  const reviewPath = reviewPathFromMetadata(n.metadata);

  return (
    <li
      data-slot="notification-row"
      data-unread={unread || undefined}
      className="group flex items-start gap-3 py-4"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            id={titleId}
            className={cn(
              "text-sm text-pretty",
              unread ? "font-semibold" : "font-medium",
            )}
          >
            {n.title}
          </p>
          {unread && (
            <Badge variant="secondary">
              <BellDot aria-hidden />
              {t("unread")}
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground [&_a]:text-foreground [&_strong]:text-foreground space-y-1 text-sm [&_a]:underline [&_a]:underline-offset-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:leading-relaxed [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{n.content}</ReactMarkdown>
        </div>
        <p className="text-muted-foreground text-xs tabular-nums">
          <RelativeTime date={n.createdAt} />
        </p>
        {reviewPath && (
          <ArrowLink
            href={reviewPath}
            onClick={() => {
              if (unread) actions.markRead(n.id);
            }}
          >
            {t("reviewSuggestion")}
          </ArrowLink>
        )}
      </div>

      <div
        data-slot="notification-actions"
        className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
      >
        {unread ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("markRead")}
            aria-describedby={titleId}
            title={t("markRead")}
            disabled={actions.pending}
            onClick={() => actions.markRead(n.id)}
          >
            <CheckCheckIcon aria-hidden />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("markUnread")}
            aria-describedby={titleId}
            title={t("markUnread")}
            disabled={actions.pending}
            onClick={() => actions.markUnread(n.id)}
          >
            <BellOffIcon aria-hidden />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("delete")}
          aria-describedby={titleId}
          title={t("delete")}
          disabled={actions.pending}
          onClick={() => actions.remove(n.id)}
        >
          <Trash2Icon aria-hidden />
        </Button>
      </div>
    </li>
  );
}

function NotificationsEmpty() {
  const t = useTranslations("dashboard.notifications");
  return (
    <EmptyState
      className="px-0 py-8"
      title={t("emptyTitle")}
      description={t("emptyDescription")}
      action={<ArrowLink href="/communities">{t("emptyAction")}</ArrowLink>}
    />
  );
}

/**
 * The Notifications tab's list: newest first, paged, with bulk actions
 * (mark all read, clear read, clear all) above it. Clearing deletes for
 * good, so it asks first. Every change refreshes the list and the bell.
 */
export function NotificationsList() {
  const t = useTranslations("dashboard.notifications");
  const confirm = useConfirm();
  const utils = api.useUtils();

  const query = api.notifications.list.useInfiniteQuery(
    { limit: NOTIFICATIONS_PAGE_SIZE },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      initialCursor: null,
    },
  );
  const items = query.data?.pages.flatMap((page) => page.notifications) ?? [];

  const mutationOptions = {
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
    },
    onError: () => {
      toast.error(t("actionFailed"));
    },
  };
  const markRead = api.notifications.markRead.useMutation(mutationOptions);
  const markUnread = api.notifications.markUnread.useMutation(mutationOptions);
  const remove = api.notifications.delete.useMutation(mutationOptions);
  const deleteAll = api.notifications.deleteAll.useMutation(mutationOptions);
  const deleteAllRead =
    api.notifications.deleteAllRead.useMutation(mutationOptions);

  const rowActions: RowActions = {
    markRead: (id) => markRead.mutate({ id }),
    markUnread: (id) => markUnread.mutate({ id }),
    remove: (id) => remove.mutate({ id }),
    pending: markRead.isPending || markUnread.isPending || remove.isPending,
  };

  const clearRead = async () => {
    const ok = await confirm({
      title: t("clearReadConfirmTitle"),
      description: t("clearReadConfirmDescription"),
      confirmLabel: t("clearConfirm"),
      destructive: true,
    });
    if (ok) deleteAllRead.mutate();
  };
  const clearAll = async () => {
    const ok = await confirm({
      title: t("clearAllConfirmTitle"),
      description: t("clearAllConfirmDescription"),
      confirmLabel: t("clearConfirm"),
      destructive: true,
    });
    if (ok) deleteAll.mutate();
  };

  return (
    <DashboardSection
      title={t("title")}
      status={statusFromQueries(query, { isEmpty: items.length === 0 })}
      skeleton={<ListSkeleton withAction={false} />}
      empty={<NotificationsEmpty />}
    >
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => markRead.mutate({})}
          disabled={markRead.isPending}
        >
          <CheckCheckIcon aria-hidden />
          {t("markAllRead")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void clearRead()}
          disabled={deleteAllRead.isPending}
        >
          <BellOffIcon aria-hidden />
          {t("clearRead")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void clearAll()}
          disabled={deleteAll.isPending}
        >
          <Trash2Icon aria-hidden />
          {t("clearAll")}
        </Button>
      </div>

      <ul className="divide-border mt-2 divide-y">
        {items.map((n) => (
          <NotificationRow key={n.id} notification={n} actions={rowActions} />
        ))}
      </ul>
      <LoadMore query={query} className="pt-4" />
    </DashboardSection>
  );
}
