"use client";

import { useState } from "react";
import { BellIcon } from "lucide-react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { NotificationPanel } from "./notification-panel";

export function NotificationBell() {
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);

  const { data: unreadData } = api.notifications.unreadCount.useQuery(
    undefined,
    {
      enabled: !!session?.user,
      refetchInterval: 30_000,
    },
  );

  if (!session?.user) return null;

  const count = unreadData?.count ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted relative flex items-center justify-center rounded-md p-2"
        aria-label={`Notifications${count > 0 ? `, ${count} unread` : ""}`}
      >
        <BellIcon className="text-muted-foreground h-5 w-5" />
        {count > 0 && (
          <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && <NotificationPanel onClose={() => setOpen(false)} />}
    </div>
  );
}
