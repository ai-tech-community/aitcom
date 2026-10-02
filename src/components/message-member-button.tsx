"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useInbox } from "@/components/inbox/inbox-provider";
import { api } from "@/trpc/react";

export function MessageMemberButton({ recipientId }: { recipientId: string }) {
  const t = useTranslations("members");
  const { openChat } = useInbox();
  const [loading, setLoading] = useState(false);
  const startConversation = api.inbox.startConversation.useMutation();

  async function handleClick() {
    setLoading(true);
    try {
      const { conversationId } = await startConversation.mutateAsync({
        recipientId,
      });
      openChat(conversationId);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 font-mono text-xs tracking-wider uppercase"
      onClick={handleClick}
      disabled={loading}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      {t("message")}
    </Button>
  );
}
