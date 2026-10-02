import { countInboxUnread } from "@/server/inbox/unread-count";
import { countUnreadNotifications } from "@/server/notifications/unread-count";

import type { NextUpContext, NextUpUnreadItem } from "../types";

/**
 * Unread notifications and inbox messages as one catch-up item, counted
 * exactly like the bell and inbox badges. Nothing when both are zero.
 */
export async function loadUnreadItems(
  ctx: NextUpContext,
): Promise<NextUpUnreadItem[]> {
  const [notifications, messages] = await Promise.all([
    countUnreadNotifications(ctx.db, ctx.userId),
    countInboxUnread(ctx.db, ctx.userId),
  ]);
  if (notifications === 0 && messages === 0) return [];
  return [
    {
      kind: "unread",
      key: "unread",
      urgency: { tier: "catchUp" },
      notifications,
      messages,
    },
  ];
}
