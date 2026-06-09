"use client";

import { MessageSquareIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { useInbox } from "./inbox-provider";
import { LIVE_BADGE_REFETCH_MS } from "./live-refetch";

export function InboxPill() {
  const { data: session } = authClient.useSession();
  const { isListOpen, toggleList } = useInbox();
  const t = useTranslations("inbox");

  const { data: unreadData } = api.inbox.totalUnreadCount.useQuery(undefined, {
    enabled: !!session?.user,
    refetchInterval: LIVE_BADGE_REFETCH_MS,
  });

  // Don't render if no session or if list is already open
  if (!session?.user || isListOpen) return null;

  const unreadCount = unreadData?.count ?? 0;

  return (
    <button
      type="button"
      onClick={toggleList}
      className="border-border bg-background flex items-center gap-2 rounded-lg border px-4 py-2.5 shadow-lg transition-opacity hover:opacity-90"
    >
      <MessageSquareIcon className="text-muted-foreground h-4 w-4" />
      <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider uppercase">
        {t("title")}
      </span>
      {unreadCount > 0 && (
        <span
          className="bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
          aria-label={`${unreadCount} ${t("unreadBadge")}`}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
