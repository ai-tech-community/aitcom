"use client";

import { useCallback, useMemo } from "react";
import {
  ArrowLeftIcon,
  BotIcon,
  MessageSquareIcon,
  PanelRightIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { RelativeTime } from "@/components/ui/relative-time";
import { getInitials } from "@/lib/avatar";
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
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { LIVE_MESSAGES_FALLBACK_MS } from "@/components/inbox/live-refetch";

type ConversationViewProps = {
  conversationId: string;
  /** Display info resolved from the conversation list (header). */
  peer: { name: string; image: string | null; isAgent: boolean } | null;
  agentLastActiveAt?: Date | string | null;
  onToggleProfile: () => void;
  /** Mobile only: back to the list pane. */
  onBack?: () => void;
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function ConversationView({
  conversationId,
  peer,
  agentLastActiveAt,
  onToggleProfile,
  onBack,
}: ConversationViewProps) {
  const t = useTranslations("inbox");
  const { data: session } = authClient.useSession();
  const utils = api.useUtils();
  const currentUserId = session?.user?.id;

  const messagesQuery = api.inbox.getMessages.useQuery(
    { conversationId, limit: 50 },
    { refetchInterval: LIVE_MESSAGES_FALLBACK_MS },
  );

  const sendMessage = api.inbox.sendMessage.useMutation({
    // Optimistic send — verbatim from chat-window.tsx (ADR-0025 Tier 0).
    onMutate: async ({ content }) => {
      if (!currentUserId) return;
      const key = { conversationId, limit: 50 };
      await utils.inbox.getMessages.cancel(key);
      const previous = utils.inbox.getMessages.getData(key);
      utils.inbox.getMessages.setData(key, (old) => {
        if (!old) return old;
        const optimistic = {
          id: `optimistic-${Date.now()}`,
          senderId: currentUserId,
          senderType: "human" as const,
          content,
          createdAt: new Date(),
        } as (typeof old.messages)[number];
        return { ...old, messages: [...old.messages, optimistic] };
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        utils.inbox.getMessages.setData(
          { conversationId, limit: 50 },
          ctx.previous,
        );
      }
    },
    onSettled: () => {
      void utils.inbox.getMessages.invalidate();
      void utils.inbox.listConversations.invalidate();
      void utils.inbox.totalUnreadCount.invalidate();
    },
  });

  const handleSubmit = useCallback(
    async (message: { text: string }) => {
      const text = message.text.trim();
      if (!text) return;
      await sendMessage.mutateAsync({ conversationId, content: text });
    },
    [conversationId, sendMessage],
  );

  const messages = useMemo(
    () => messagesQuery.data?.messages ?? [],
    [messagesQuery.data],
  );

  const isAgent = peer?.isAgent ?? false;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring -ml-1 rounded-md p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none lg:hidden"
            aria-label={t("back")}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </button>
        )}
        <div className="relative shrink-0">
          <Avatar>
            {peer?.image && <AvatarImage src={peer.image} alt={peer.name} />}
            <AvatarFallback>{getInitials(peer?.name ?? "?")}</AvatarFallback>
          </Avatar>
          {isAgent && (
            <span className="bg-background absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full">
              <BotIcon className="text-muted-foreground h-3 w-3" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-semibold">
            {peer?.name ?? "—"}
          </p>
          {isAgent && agentLastActiveAt ? (
            <p className="text-muted-foreground truncate text-xs">
              {t("lastActive")}{" "}
              <RelativeTime
                date={agentLastActiveAt}
                className="text-muted-foreground text-xs"
              />
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggleProfile}
          className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring rounded-md p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label={t("showProfile")}
          title={t("showProfile")}
        >
          <PanelRightIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      {messagesQuery.isLoading ? (
        <div className="flex flex-1 flex-col gap-6 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={i % 2 === 0 ? "mr-auto w-3/5" : "ml-auto w-2/5"}
            >
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <Conversation className="flex-1">
          <ConversationContent className="gap-4 p-4 sm:px-6">
            {isAgent && messages.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <BotIcon className="text-muted-foreground h-8 w-8" />
                <p className="text-foreground text-sm font-medium">
                  {t("agentEmptyTitle")}
                </p>
                <p className="text-muted-foreground max-w-xs text-sm">
                  {t("agentEmptyDescription")}
                </p>
                <Link
                  href="/dashboard/agent"
                  className="text-primary focus-visible:ring-ring rounded text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                  {t("agentEmptyCta")}
                </Link>
              </div>
            )}
            {!isAgent && messages.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <MessageSquareIcon className="text-muted-foreground h-8 w-8" />
                <p className="text-foreground text-sm font-medium">
                  {t("sayHello")}
                </p>
                <p className="text-muted-foreground max-w-xs text-sm">
                  {t("sayHelloDescription")}
                </p>
              </div>
            )}
            {messages.map((msg, idx) => {
              const isUser =
                msg.senderId === currentUserId && msg.senderType === "human";
              const prevMsg = messages[idx - 1];
              const showDateSeparator =
                !prevMsg ||
                toDateKey(msg.createdAt) !== toDateKey(prevMsg.createdAt);

              let dateLabel: string | undefined;
              if (showDateSeparator) {
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
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
                      <span className="text-muted-foreground shrink-0 font-mono text-xs font-medium tracking-wider uppercase">
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
                      className={`text-muted-foreground font-mono text-xs ${isUser ? "ml-auto" : ""}`}
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

      {/* Composer */}
      <div className="border-border border-t p-3 **:data-[slot=input-group]:rounded-lg">
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
