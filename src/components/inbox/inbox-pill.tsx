"use client";

import { MessageSquareIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { useInbox } from "./inbox-provider";

export function InboxPill() {
  const { data: session } = authClient.useSession();
  const { isListOpen, toggleList } = useInbox();
  const t = useTranslations("inbox");

  const { data: unreadData } = api.inbox.totalUnreadCount.useQuery(undefined, {
    enabled: !!session?.user,
    refetchInterval: 30_000,
  });

  // Don't render if no session or if list is already open
  if (!session?.user || isListOpen) return null;

  const unreadCount = unreadData?.count ?? 0;

  return (
    <button
      type="button"
      onClick={toggleList}
      className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 shadow-lg transition-opacity hover:opacity-90"
    >
      <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
      <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t("title")}
      </span>
      {unreadCount > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
