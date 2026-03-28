"use client";

import { useState } from "react";
import { BellIcon } from "lucide-react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { NotificationPanel } from "./notification-panel";

export function NotificationBell() {
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);

  const { data: unreadData } = api.notifications.unreadCount.useQuery(undefined, {
    enabled: !!session?.user,
    refetchInterval: 30_000,
  });

  if (!session?.user) return null;

  const count = unreadData?.count ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center rounded-md p-2 hover:bg-muted"
        aria-label={`Notifications${count > 0 ? `, ${count} unread` : ""}`}
      >
        <BellIcon className="h-5 w-5 text-muted-foreground" />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && <NotificationPanel onClose={() => setOpen(false)} />}
    </div>
  );
}
