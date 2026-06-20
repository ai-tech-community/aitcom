import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MessagesShell } from "@/components/messages/messages-shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return {
    title: t("messagesKicker"),
    robots: { index: false, follow: false },
  };
}

export default async function MessagesConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <MessagesShell activeConversationId={conversationId} />;
}
