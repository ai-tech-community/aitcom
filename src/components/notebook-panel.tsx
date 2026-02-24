"use client";

import { useEffect, useState } from "react";
import {
  MessageSquareIcon,
  ChevronDownIcon,
  BotIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
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
import { Spinner } from "@/components/ui/spinner";

export function NotebookPanel() {
  const { data: session } = authClient.useSession();
  const t = useTranslations("notebook");
  const [expanded, setExpanded] = useState(false);
  const utils = api.useUtils();

  // ── Data fetching ────────────────────────────────────────────────────────

  const { data: unreadData } = api.notebook.unreadCount.useQuery(undefined, {
    enabled: !!session?.user,
    refetchInterval: 30_000,
  });

  const { data: messagesData, isLoading } =
    api.notebook.getMessages.useQuery(
      { limit: 50 },
      { enabled: !!session?.user && expanded },
    );

  const sendMessage = api.notebook.sendMessage.useMutation({
    onSuccess: () => {
      void utils.notebook.getMessages.invalidate();
      void utils.notebook.unreadCount.invalidate();
    },
  });

  const markRead = api.notebook.markRead.useMutation({
    onSuccess: () => {
      void utils.notebook.unreadCount.invalidate();
    },
  });

  // ── Mark messages as read when expanded ──────────────────────────────────

  const hasAgent = messagesData?.hasAgent ?? false;

  useEffect(() => {
    if (expanded && hasAgent) {
      markRead.mutate();
    }
  }, [expanded, hasAgent, markRead.mutate]);

  // ── Hidden state ─────────────────────────────────────────────────────────

  if (!session) {
    return null;
  }

  // ── Collapsed state ──────────────────────────────────────────────────────

  const unreadCount = unreadData?.count ?? 0;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 shadow-lg transition-opacity hover:opacity-90"
      >
        <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("title")}
        </span>
        {unreadCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    );
  }

  // ── Expanded state ───────────────────────────────────────────────────────

  const messages = messagesData?.messages ?? [];

  function handleSubmit({ text }: { text: string }) {
    const content = text.trim();
    if (!content) return;
    sendMessage.mutate({ content });
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex h-[500px] w-[380px] flex-col rounded-lg border border-border bg-background shadow-lg max-sm:inset-x-4 max-sm:top-20 max-sm:h-auto max-sm:w-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / NOTEBOOK
        </span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
          aria-label="Minimize"
        >
          <ChevronDownIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Chat area */}
      {!hasAgent && !isLoading ? (
        // No agent state
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <BotIcon className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("noAgent")}</p>
        </div>
      ) : isLoading ? (
        // Loading state
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      ) : messages.length === 0 ? (
        // Empty state
        <Conversation className="flex-1">
          <ConversationContent>
            <ConversationEmptyState
              title={t("emptyTitle")}
              description={t("emptyDescription")}
              icon={<BotIcon className="h-8 w-8" />}
            />
          </ConversationContent>
        </Conversation>
      ) : (
        // Messages
        <Conversation className="flex-1">
          <ConversationContent>
            {messages.map((msg) => (
              <Message
                key={msg.id}
                from={msg.role === "human" ? "user" : "assistant"}
              >
                <MessageContent>
                  {msg.role === "agent" ? (
                    <MessageResponse>{msg.content}</MessageResponse>
                  ) : (
                    msg.content
                  )}
                </MessageContent>
              </Message>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {/* Input */}
      {hasAgent && (
        <div className="border-t border-border p-3">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputTextarea placeholder={t("placeholder")} />
            <PromptInputFooter>
              <PromptInputSubmit disabled={sendMessage.isPending} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      )}
    </div>
  );
}
