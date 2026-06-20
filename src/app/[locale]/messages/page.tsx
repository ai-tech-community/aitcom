import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildAlternates } from "@/lib/metadata";
import { MessagesShell } from "@/components/messages/messages-shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return {
    title: t("messagesKicker"),
    alternates: buildAlternates("/messages"),
    robots: { index: false, follow: false },
  };
}

export default function MessagesPage() {
  return <MessagesShell />;
}
