"use client";

import { useEffect, useState } from "react";
import { BellIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { usePathname } from "@/i18n/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ShellUnreadBadge } from "@/components/shells/unread-badge";
import { NotificationPanel } from "./notification-panel";

export function NotificationBell({
  compact = false,
  signedIn = false,
}: { compact?: boolean; signedIn?: boolean } = {}) {
  return compact ? (
    <CompactNotificationBell signedIn={signedIn} />
  ) : (
    <LegacyNotificationBell />
  );
}

function useNotificationCount() {
  const { data: session } = authClient.useSession();
  const { data: unreadData } = api.notifications.unreadCount.useQuery(
    undefined,
    {
      enabled: !!session?.user,
      refetchInterval: 30_000,
    },
  );

  return session?.user ? (unreadData?.count ?? 0) : null;
}

function NotificationIcon({
  count,
  unreadLabel,
}: {
  count: number;
  unreadLabel?: string;
}) {
  return (
    <>
      <BellIcon
        className="text-muted-foreground h-5 w-5"
        aria-hidden={!!unreadLabel || undefined}
      />
      {unreadLabel ? (
        <ShellUnreadBadge count={count} label={unreadLabel} />
      ) : count > 0 ? (
        <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </>
  );
}

function CompactNotificationBell({ signedIn }: { signedIn: boolean }) {
  const unread = useNotificationCount();
  const [open, setOpen] = useState(false);
  const t = useTranslations("redesign.shell");
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  if (unread === null && !signedIn) return null;
  const count = unread ?? 0;
  const unreadLabel = t("unreadNotifications", { count });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hover:bg-muted focus-visible:ring-ring relative flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-inset"
          title={count ? unreadLabel : t("notifications")}
          aria-label={
            count ? `${t("notifications")}, ${unreadLabel}` : t("notifications")
          }
        >
          <NotificationIcon count={count} unreadLabel={unreadLabel} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden p-0 motion-reduce:animate-none"
        aria-label={t("notifications")}
      >
        <NotificationPanel onClose={() => setOpen(false)} embedded />
      </PopoverContent>
    </Popover>
  );
}

function LegacyNotificationBell() {
  const count = useNotificationCount();
  const [open, setOpen] = useState(false);
  if (count === null) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted relative flex items-center justify-center rounded-md p-2"
        aria-label={`Notifications${count > 0 ? `, ${count} unread` : ""}`}
      >
        <NotificationIcon count={count} />
      </button>
      {open && <NotificationPanel onClose={() => setOpen(false)} />}
    </div>
  );
}
