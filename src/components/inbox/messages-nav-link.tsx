"use client";

import { MessageSquareIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { cn } from "@/lib/utils";
import { LIVE_BADGE_REFETCH_MS } from "./live-refetch";
import { shellActiveTab } from "@/components/shells/shell-navigation";
import { ShellUnreadBadge } from "@/components/shells/unread-badge";

/**
 * Direct top-bar entry to the dedicated Messages page (`/messages`), so members
 * reach their conversations in one click instead of routing through the
 * floating inbox chat. Mirrors NotificationBell's icon-button treatment and
 * shares the same unread query as the inbox pill (React Query dedupes the
 * fetch). Authenticated-only — it self-gates to null when signed out.
 */
export function MessagesNavLink({
  presentation = "legacy",
  signedIn = false,
}: {
  presentation?: "legacy" | "desktop" | "bottom";
  signedIn?: boolean;
} = {}) {
  const { data: session } = authClient.useSession();
  const t = useTranslations("nav");
  const shell = useTranslations("redesign.shell");
  const locale = useLocale();
  const pathname = usePathname();

  const { data: unreadData } = api.inbox.totalUnreadCount.useQuery(undefined, {
    enabled: !!session?.user,
    refetchInterval: LIVE_BADGE_REFETCH_MS,
  });

  const authenticated = !!session?.user || signedIn;
  if (!authenticated && presentation !== "bottom") return null;

  const count = authenticated ? (unreadData?.count ?? 0) : 0;
  const label = t("messages");
  const active =
    pathname === "/messages" ||
    (presentation !== "legacy" && pathname.startsWith("/messages/"));
  const compact = presentation !== "legacy";
  const bottom = presentation === "bottom";

  return (
    <Link
      href={
        authenticated
          ? "/messages"
          : {
              pathname: "/auth/signin",
              query: { redirect: `/${locale}/messages` },
            }
      }
      aria-label={`${label}${count > 0 ? `, ${compact ? shell("unread", { count }) : `${count} unread`}` : ""}`}
      title={compact ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "hover:bg-muted relative flex items-center justify-center rounded-md p-2 transition-colors",
        active && "bg-muted",
        compact &&
          "focus-visible:ring-ring h-11 min-w-11 gap-1 px-1 outline-none focus-visible:ring-2 focus-visible:ring-inset",
        presentation === "desktop" && "hidden lg:flex",
        bottom &&
          "h-auto min-h-14 w-full flex-col gap-1 p-1 text-xs leading-tight font-medium",
        active && bottom && shellActiveTab,
      )}
    >
      <span className={compact ? "inline-flex items-center gap-1" : "contents"}>
        <MessageSquareIcon
          aria-hidden={compact || undefined}
          className={cn(
            "size-5 shrink-0",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        />
        {compact ? <ShellUnreadBadge count={count} /> : null}
      </span>
      {bottom ? (
        <span data-shell-nav-label="" className="max-w-full wrap-break-word">
          {label}
        </span>
      ) : null}
      {!compact && count > 0 ? (
        <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
