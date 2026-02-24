"use client";

import { useEffect } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { BotIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";

export default function NotebookPage() {
  const t = useTranslations("notebook");
  const utils = api.useUtils();

  const { data, isLoading } = api.notebook.getMessages.useQuery({
    limit: 50,
  });

  const sendMessage = api.notebook.sendMessage.useMutation({
    onSuccess: () => {
      void utils.notebook.getMessages.invalidate();
    },
  });

  const markRead = api.notebook.markRead.useMutation();

  // Mark messages as read on mount
  useEffect(() => {
    if (data?.hasAgent) {
      markRead.mutate();
    }
    // Only run on mount and when hasAgent changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.hasAgent]);

  const messages = data?.messages ?? [];
  const hasAgent = data?.hasAgent ?? false;

  function handleSubmit(message: { text: string }) {
    const content = message.text.trim();
    if (!content) return;
    sendMessage.mutate({ content });
  }

  // No agent state
  if (!isLoading && !hasAgent) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / NOTEBOOK
          </span>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <BotIcon className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("noAgent")}</p>
          <Link
            href="/dashboard/agent"
            className="mt-2 font-mono text-xs tracking-wider text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Set up Agent
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-20rem)] min-h-[400px] flex-col rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / NOTEBOOK
        </span>
      </div>

      {/* Chat area */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : messages.length === 0 ? (
        <Conversation className="flex-1">
          <ConversationContent className="flex h-full items-center justify-center">
            <ConversationEmptyState
              title={t("emptyTitle")}
              description={t("emptyDescription")}
              icon={<BotIcon className="h-8 w-8" />}
            />
          </ConversationContent>
        </Conversation>
      ) : (
        <Conversation className="flex-1">
          <ConversationContent>
            {messages.map((msg) => (
              <Message
                key={msg.id}
                from={msg.role === "human" ? "user" : "assistant"}
              >
                <MessageContent>
                  {msg.role === "human" ? (
                    <p>{msg.content}</p>
                  ) : (
                    <MessageResponse>{msg.content}</MessageResponse>
                  )}
                </MessageContent>
              </Message>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {/* Input area */}
      <div className="border-t border-border p-4">
        <PromptInput
          onSubmit={handleSubmit}
          className="rounded-lg border border-border bg-background"
        >
          <PromptInputTextarea
            placeholder={t("placeholder")}
            disabled={!hasAgent || sendMessage.isPending}
          />
          <PromptInputFooter>
            <div />
            <PromptInputSubmit
              disabled={!hasAgent || sendMessage.isPending}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
