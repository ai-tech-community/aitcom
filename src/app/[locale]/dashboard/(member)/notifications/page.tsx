import type { Metadata } from "next";
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { api, HydrateClient } from "@/trpc/server";
import { NotificationsPageContent } from "@/components/notifications/notifications-page-content";
import { NotificationPrefs } from "@/components/notifications/notification-prefs";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  const t = await getTranslations("notificationPrefs");

  void api.notifications.list.prefetchInfinite({ limit: 30, cursor: null });

  return (
    <HydrateClient>
      <NotificationsPageContent />

      <div className="mx-auto mt-10 max-w-2xl space-y-6">
        <div>
          <h2 className="text-xl font-semibold">{t("title")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("description")}
          </p>
        </div>
        <NotificationPrefs />
      </div>
    </HydrateClient>
  );
}
