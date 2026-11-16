"use client";

import { useCallback } from "react";
import { ArrowLeftIcon, BotIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/server/better-auth/client";
import { Spinner } from "@/components/ui/spinner";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { useInbox } from "./inbox-provider";
import { MessageBody } from "./message-body";
import { useConversationMessages } from "./conversation-messages";
import { MessageComposer } from "./message-composer";
import { useInboxStream } from "./use-inbox-stream";

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

  useInboxStream();

  // ── Data fetching ─────────────────────────────────────────────────────

  const messagesQuery = useConversationMessages(chatInfo.conversationId);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    setActiveChat(null);
  }, [setActiveChat]);

  const handleClose = useCallback(() => {
    setActiveChat(null);
    toggleList();
  }, [setActiveChat, toggleList]);

  // ── Derived data ──────────────────────────────────────────────────────

  const currentUserId = session?.user?.id;
  const messages = messagesQuery.data?.messages ?? [];

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="border-border flex items-center gap-2 border-b px-3 py-2.5">
        {/* Back arrow */}
        <button
          type="button"
          onClick={handleBack}
          className="text-muted-foreground hover:bg-secondary/50 hover:text-foreground rounded-md p-1.5 transition-colors"
          aria-label={t("back")}
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>

        {/* Avatar */}
        <div className="relative shrink-0">
          <Avatar>
            {chatInfo.image && (
              <AvatarImage src={chatInfo.image} alt={chatInfo.displayName} />
            )}
            <AvatarFallback>{getInitials(chatInfo.displayName)}</AvatarFallback>
          </Avatar>
          {chatInfo.isAgent && (
            <span className="bg-background absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full">
              <BotIcon className="text-muted-foreground h-3 w-3" />
            </span>
          )}
        </div>

        {/* Name */}
        <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
          {chatInfo.displayName}
        </span>

        {/* Close X */}
        <button
          type="button"
          onClick={handleClose}
          className="text-muted-foreground hover:bg-secondary/50 hover:text-foreground rounded-md p-1.5 transition-colors"
          aria-label={t("close")}
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {/* ── Messages area ───────────────────────────────────────────── */}
      {messagesQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="text-muted-foreground h-5 w-5" />
        </div>
      ) : (
        <Conversation className="flex-1">
          <ConversationContent className="gap-4 p-3">
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
                      <span className="text-muted-foreground shrink-0 text-xs font-medium uppercase">
                        {dateLabel}
                      </span>
                      <div className="bg-border h-px flex-1" />
                    </div>
                  )}
                  <Message from={isUser ? "user" : "assistant"}>
                    <MessageContent>
                      <MessageBody
                        message={msg}
                        isUser={isUser}
                        conversationId={chatInfo.conversationId}
                      />
                    </MessageContent>
                    <span
                      className={`text-muted-foreground text-xs ${isUser ? "ml-auto" : ""}`}
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
      <div className="border-border border-t">
        <MessageComposer
          conversationId={chatInfo.conversationId}
          placeholder={t("placeholder")}
          kind={chatInfo.isAgent ? "agent" : "person"}
        />
      </div>
    </div>
  );
}
