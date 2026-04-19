"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import {
  BotIcon,
  ChevronDownIcon,
  Maximize2Icon,
  Minimize2Icon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Spinner } from "@/components/ui/spinner";
import {
  Conversation,
  ConversationContent,
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
import { Link } from "@/i18n/navigation";
import { useInbox } from "./inbox-provider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChatWindowProps = {
  conversationId: string;
  displayName: string;
  image: string | null;
  isAgent: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatWindow({
  conversationId,
  displayName,
  image,
  isAgent,
}: ChatWindowProps) {
  const { closeChat, minimizeChat } = useInbox();
  const { data: session } = authClient.useSession();
  const t = useTranslations("inbox");
  const utils = api.useUtils();
  const [expanded, setExpanded] = useState(false);

  // ── Data fetching ───────────────────────────────────────────────────────

  const messagesQuery = api.inbox.getMessages.useQuery(
    { conversationId, limit: 50 },
    { refetchInterval: 10_000 },
  );

  const sendMessage = api.inbox.sendMessage.useMutation({
    onSuccess: () => {
      void utils.inbox.getMessages.invalidate();
      void utils.inbox.listConversations.invalidate();
      void utils.inbox.totalUnreadCount.invalidate();
    },
  });

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (message: { text: string }) => {
      const text = message.text.trim();
      if (!text) return;
      await sendMessage.mutateAsync({ conversationId, content: text });
    },
    [conversationId, sendMessage],
  );

  // ── Derived data ────────────────────────────────────────────────────────

  const currentUserId = session?.user?.id;
  const messages = messagesQuery.data?.messages ?? [];

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      className={`border-border bg-background flex flex-col overflow-hidden rounded-lg border shadow-lg transition-all duration-200 ${expanded ? "h-150 w-120" : "h-112.5 w-80"}`}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="border-border flex items-center gap-2 border-b px-3 py-2.5">
        {/* Avatar */}
        <div className="relative shrink-0">
          {image ? (
            <Image
              src={image}
              alt={displayName}
              width={32}
              height={32}
              unoptimized
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="bg-secondary text-muted-foreground flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {isAgent && (
            <span className="bg-background absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full">
              <BotIcon className="text-muted-foreground h-3 w-3" />
            </span>
          )}
        </div>

        {/* Name */}
        <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
          {displayName}
        </span>

        {/* Actions */}
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-muted-foreground hover:bg-secondary/50 hover:text-foreground rounded-md p-1.5 transition-colors"
          aria-label={expanded ? t("collapse") : t("expand")}
        >
          {expanded ? (
            <Minimize2Icon className="h-4 w-4" />
          ) : (
            <Maximize2Icon className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => minimizeChat(conversationId)}
          className="text-muted-foreground hover:bg-secondary/50 hover:text-foreground rounded-md p-1.5 transition-colors"
          aria-label={t("minimize")}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => closeChat(conversationId)}
          className="text-muted-foreground hover:bg-secondary/50 hover:text-foreground rounded-md p-1.5 transition-colors"
          aria-label={t("close")}
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {/* ── Messages area ─────────────────────────────────────────────── */}
      {messagesQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="text-muted-foreground h-5 w-5" />
        </div>
      ) : (
        <Conversation className="flex-1">
          <ConversationContent className="gap-4 p-3">
            {isAgent && messages.length === 0 && !messagesQuery.isLoading && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <BotIcon className="text-muted-foreground h-8 w-8" />
                <p className="text-muted-foreground text-sm">
                  Connect your bot to start chatting.
                </p>
                <Link
                  href="/dashboard/agent"
                  className="text-primary text-xs underline-offset-4 hover:underline"
                >
                  Generate an API key to get started
                </Link>
              </div>
            )}
            {messages.map((msg, idx) => {
              const isUser =
                msg.senderId === currentUserId && msg.senderType === "human";

              const prevMsg = messages[idx - 1];
              const showDateSeparator =
                !prevMsg ||
                toDateKey(msg.createdAt) !== toDateKey(prevMsg.createdAt);

              const today = new Date();
              const yesterday = new Date(today);
              yesterday.setDate(yesterday.getDate() - 1);

              let dateLabel: string | undefined;
              if (showDateSeparator) {
                const key = toDateKey(msg.createdAt);
                if (key === toDateKey(today)) {
                  dateLabel = t("today");
                } else if (key === toDateKey(yesterday)) {
                  dateLabel = t("yesterday");
                } else {
                  dateLabel = msg.createdAt.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year:
                      msg.createdAt.getFullYear() !== today.getFullYear()
                        ? "numeric"
                        : undefined,
                  });
                }
              }

              return (
                <div key={msg.id} className="flex flex-col gap-4">
                  {dateLabel && (
                    <div className="flex items-center gap-3">
                      <div className="bg-border h-px flex-1" />
                      <span className="text-muted-foreground shrink-0 text-[10px] font-medium uppercase">
                        {dateLabel}
                      </span>
                      <div className="bg-border h-px flex-1" />
                    </div>
                  )}
                  <Message from={isUser ? "user" : "assistant"}>
                    <MessageContent>
                      {isUser ? (
                        <p>{msg.content}</p>
                      ) : (
                        <MessageResponse>{msg.content}</MessageResponse>
                      )}
                    </MessageContent>
                    <span
                      className={`text-muted-foreground text-[10px] ${isUser ? "ml-auto" : ""}`}
                    >
                      {formatTime(msg.createdAt)}
                    </span>
                  </Message>
                </div>
              );
            })}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {/* ── Input area ────────────────────────────────────────────────── */}
      <div className="border-border border-t **:data-[slot=input-group]:rounded-none **:data-[slot=input-group]:border-0 **:data-[slot=input-group]:shadow-none">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            placeholder={t("placeholder")}
            className="min-h-10 text-sm"
          />
          <PromptInputFooter>
            <div />
            <PromptInputSubmit disabled={sendMessage.isPending} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
