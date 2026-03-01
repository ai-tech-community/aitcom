import type { Metadata } from "next";
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { api, HydrateClient } from "@/trpc/server";
import { NotificationsPageContent } from "@/components/notifications/notifications-page-content";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  void api.notifications.list.prefetchInfinite({ limit: 30, cursor: null });

  return (
    <HydrateClient>
      <NotificationsPageContent />
    </HydrateClient>
  );
}
