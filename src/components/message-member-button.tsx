"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useInbox } from "@/components/inbox/inbox-provider";
import { api } from "@/trpc/react";

export function MessageMemberButton({
  recipientId,
  recipientName,
  prominent = false,
}: {
  recipientId: string;
  recipientName?: string;
  prominent?: boolean;
}) {
  const t = useTranslations("members");
  const redesign = useTranslations("redesign.members");
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
    } catch (error) {
      if (recipientName === undefined) throw error;
      toast.error(redesign("messageError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={prominent ? "ink" : "outline"}
      size="sm"
      className={
        recipientName === undefined
          ? "gap-2 font-mono text-xs tracking-wider uppercase"
          : "min-h-11 gap-2 shadow-none sm:min-h-9"
      }
      aria-label={
        recipientName === undefined
          ? undefined
          : redesign("messagePerson", { name: recipientName })
      }
      onClick={handleClick}
      disabled={loading}
    >
      <MessageSquare aria-hidden className="h-3.5 w-3.5" />
      {recipientName === undefined ? t("message") : redesign("message")}
    </Button>
  );
}
