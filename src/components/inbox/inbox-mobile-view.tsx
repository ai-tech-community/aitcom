"use client";

import { useCallback } from "react";
import { ArrowLeftIcon, BotIcon, XIcon } from "lucide-react";
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
import { useInbox } from "./inbox-provider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MobileChatInfo = {
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

export function InboxMobileView({ chatInfo }: { chatInfo: MobileChatInfo }) {
  const { setActiveChat, toggleList } = useInbox();
  const { data: session } = authClient.useSession();
  const t = useTranslations("inbox");
  const utils = api.useUtils();

  // ── Data fetching ─────────────────────────────────────────────────────

  const messagesQuery = api.inbox.getMessages.useQuery(
    { conversationId: chatInfo.conversationId, limit: 50 },
    { refetchInterval: 10_000 },
  );

  const sendMessage = api.inbox.sendMessage.useMutation({
    onSuccess: () => {
      void utils.inbox.getMessages.invalidate();
      void utils.inbox.listConversations.invalidate();
      void utils.inbox.totalUnreadCount.invalidate();
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    setActiveChat(null);
  }, [setActiveChat]);

  const handleClose = useCallback(() => {
    setActiveChat(null);
    toggleList();
  }, [setActiveChat, toggleList]);

  const handleSubmit = useCallback(
    async (message: { text: string }) => {
      const text = message.text.trim();
      if (!text) return;
      await sendMessage.mutateAsync({
        conversationId: chatInfo.conversationId,
        content: text,
      });
    },
    [chatInfo.conversationId, sendMessage],
  );

  // ── Derived data ──────────────────────────────────────────────────────

  const currentUserId = session?.user?.id;
  const messages = messagesQuery.data?.messages ?? [];

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        {/* Back arrow */}
        <button
          type="button"
          onClick={handleBack}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
          aria-label={t("back")}
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>

        {/* Avatar */}
        <div className="relative shrink-0">
          {chatInfo.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar URL is dynamic external source
            <img
              src={chatInfo.image}
              alt={chatInfo.displayName}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-medium text-muted-foreground">
              {chatInfo.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {chatInfo.isAgent && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background">
              <BotIcon className="h-3 w-3 text-muted-foreground" />
            </span>
          )}
        </div>

        {/* Name */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {chatInfo.displayName}
        </span>

        {/* Close X */}
        <button
          type="button"
          onClick={handleClose}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
          aria-label={t("close")}
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {/* ── Messages area ───────────────────────────────────────────── */}
      {messagesQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : (
        <Conversation className="flex-1">
          <ConversationContent className="gap-4 p-3">
            {messages.map((msg, idx) => {
              const isUser =
                msg.senderId === currentUserId &&
                msg.senderType === "human";

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
                      <div className="h-px flex-1 bg-border" />
                      <span className="shrink-0 text-[10px] font-medium uppercase text-muted-foreground">
                        {dateLabel}
                      </span>
                      <div className="h-px flex-1 bg-border" />
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
                      className={`text-[10px] text-muted-foreground ${isUser ? "ml-auto" : ""}`}
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

      {/* ── Input area ──────────────────────────────────────────────── */}
      <div className="border-t border-border">
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
