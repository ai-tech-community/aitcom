"use client";

import { useEffect, useRef, useState } from "react";
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

const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

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
  const hasMarkedRead = useRef(false);

  useEffect(() => {
    if (expanded && hasAgent && !hasMarkedRead.current) {
      hasMarkedRead.current = true;
      markRead.mutate();
    }
    if (!expanded) {
      hasMarkedRead.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, hasAgent]);

  // ── Hidden state ─────────────────────────────────────────────────────────

  if (!session) {
    return null;
  }

  // ── Collapsed state ──────────────────────────────────────────────────────

  const unreadCount = unreadData?.count ?? 0;
  const agentLastActiveAt = messagesData?.agentLastActiveAt
    ? new Date(messagesData.agentLastActiveAt)
    : null;
  const isAgentActive =
    agentLastActiveAt != null &&
    Date.now() - agentLastActiveAt.getTime() < ACTIVE_THRESHOLD_MS;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 shadow-lg transition-opacity hover:opacity-90"
      >
        <span className="relative">
          <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
          {isAgentActive && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500" />
          )}
        </span>
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
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
            / {t("title")}
          </span>
          {agentLastActiveAt && (
            <span className="flex items-center gap-1">
              <span
                className={`h-1.5 w-1.5 rounded-full ${isAgentActive ? "bg-green-500" : "bg-muted-foreground/40"}`}
              />
              <span className="font-mono text-[10px] text-muted-foreground">
                {isAgentActive ? "Active" : timeAgo(agentLastActiveAt)}
              </span>
            </span>
          )}
        </div>
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
              <div key={msg.id}>
                <Message
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
                <p
                  className={`mt-1 font-mono text-[10px] text-muted-foreground/60 ${
                    msg.role === "human" ? "text-right" : "text-left"
                  }`}
                >
                  {formatTime(new Date(msg.createdAt))}
                </p>
              </div>
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
