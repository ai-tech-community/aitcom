import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/lib/metadata";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { messageCommunitySlug } from "@/lib/communities/message-return";
import { MessagesShell } from "@/components/messages/messages-shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return {
    title: t("messagesKicker"),
    alternates: await localeAlternates("/messages"),
    robots: { index: false, follow: false },
  };
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    fromCommunity?: string | string[];
    view?: string | string[];
  }>;
}) {
  const redesigned = isOpenCommunitiesEnabled();
  const query = redesigned ? await searchParams : undefined;
  const fromCommunity = messageCommunitySlug(query?.fromCommunity);
  const unreadOnly = query?.view === "unread";
  return (
    <MessagesShell
      redesigned={redesigned}
      fromCommunity={fromCommunity}
      unreadOnly={unreadOnly}
    />
  );
}
