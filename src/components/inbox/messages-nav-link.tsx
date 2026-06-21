"use client";

import { MessageSquareIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { cn } from "@/lib/utils";
import { LIVE_BADGE_REFETCH_MS } from "./live-refetch";

/**
 * Direct top-bar entry to the dedicated Messages page (`/messages`), so members
 * reach their conversations in one click instead of routing through the
 * floating inbox chat. Mirrors NotificationBell's icon-button treatment and
 * shares the same unread query as the inbox pill (React Query dedupes the
 * fetch). Authenticated-only — it self-gates to null when signed out.
 */
export function MessagesNavLink() {
  const { data: session } = authClient.useSession();
  const t = useTranslations("nav");
  const pathname = usePathname();

  const { data: unreadData } = api.inbox.totalUnreadCount.useQuery(undefined, {
    enabled: !!session?.user,
    refetchInterval: LIVE_BADGE_REFETCH_MS,
  });

  if (!session?.user) return null;

  const count = unreadData?.count ?? 0;
  const label = t("messages");
  const active = pathname === "/messages";

  return (
    <Link
      href="/messages"
      aria-label={`${label}${count > 0 ? `, ${count} unread` : ""}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "hover:bg-muted relative flex items-center justify-center rounded-md p-2 transition-colors",
        active && "bg-muted",
      )}
    >
      <MessageSquareIcon
        className={cn(
          "h-5 w-5",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      />
      {count > 0 && (
        <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
