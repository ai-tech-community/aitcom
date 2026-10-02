import type { Metadata } from "next";

import { api, HydrateClient } from "@/trpc/server";
import { IntroductionConsent } from "@/components/notifications/introduction-consent";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { NOTIFICATIONS_PAGE_SIZE } from "@/components/notifications/notifications-query";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Notifications tab: the main column only; the frame is the layout's. Email
 * preferences live on the Settings tab.
 */
export default async function NotificationsPage() {
  void api.advisory.myPendingIntroductions.prefetch();
  void api.notifications.list.prefetchInfinite({
    limit: NOTIFICATIONS_PAGE_SIZE,
    cursor: null,
  });

  return (
    <HydrateClient>
      <div className="space-y-10">
        <IntroductionConsent />
        <NotificationsList />
      </div>
    </HydrateClient>
  );
}
