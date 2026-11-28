"use client";

import { useMemo } from "react";
import {
  ArrowLeftIcon,
  BotIcon,
  ArrowUpRightIcon,
  MessageSquareIcon,
  PanelRightIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/server/better-auth/client";
import {
  useInitialAuthUser,
  usePageDocumentAuthUser,
} from "@/components/auth/session-provider";
import { documentAuthUser } from "@/server/better-auth/hub-session";
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
import { Message, MessageContent } from "@/components/ai-elements/message";
import { useConversationMessages } from "@/components/inbox/conversation-messages";
import { MessageComposer } from "@/components/inbox/message-composer";
import { MessageBody } from "@/components/inbox/message-body";
import type { RouterOutputs } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { ConnectionStatus } from "@/components/inbox/connection-status";
import {
  ChatTranscript,
  RoomTranscript,
  TranscriptViewportPosition,
  type RoomAuthors,
} from "./chat-transcript";
import { ChatAvatar } from "./chat-avatar";
import { cn } from "@/lib/utils";

type ChatMessage = RouterOutputs["inbox"]["getMessages"]["messages"][number];

type ConversationViewProps = {
  conversationId: string;
  /** Display info resolved from the conversation list (header). */
  peer: { name: string; image: string | null; isAgent: boolean } | null;
  agentLastActiveAt?: Date | string | null;
  /** Optional: when omitted the profile-toggle button is not rendered. */
  onToggleProfile?: () => void;
  /** Mobile only: back to the list pane. */
  onBack?: () => void;
  /** When true, the built-in header (avatar / peer name / profile toggle) is hidden.
   *  Use this when the parent supplies its own room header. */
  hideHeader?: boolean;
  redesigned?: boolean;
  profileExpanded?: boolean;
  showConnectionStatus?: boolean;
  roomHref?: string;
  roomAuthors?: RoomAuthors;
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function UnattributedMessage({
  message,
  conversationId,
  isUser,
}: {
  message: ChatMessage;
  conversationId: string;
  isUser: boolean;
}) {
  return (
    <Message from={isUser ? "user" : "assistant"}>
      <MessageContent>
        <MessageBody
          message={message}
          isUser={isUser}
          conversationId={conversationId}
        />
      </MessageContent>
      <span
        className={`text-muted-foreground font-mono text-xs ${isUser ? "ml-auto" : ""}`}
      >
        {formatTime(message.createdAt)}
      </span>
    </Message>
  );
}

export function ConversationView({
  conversationId,
  peer,
  agentLastActiveAt,
  onToggleProfile,
  onBack,
  hideHeader = false,
  redesigned = false,
  profileExpanded,
  showConnectionStatus = true,
  roomHref,
  roomAuthors,
}: ConversationViewProps) {
  const t = useTranslations("inbox");
  const chat = useTranslations("redesign.chat");
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
  const initialUser = useInitialAuthUser();
  const pageUser = usePageDocumentAuthUser();
  const viewer = documentAuthUser(initialUser, pageUser, session?.user);

  const messagesQuery = useConversationMessages(
    conversationId,
    redesigned ? viewer?.id : undefined,
  );

  const messages = useMemo(
    () => messagesQuery.data?.messages ?? [],
    [messagesQuery.data],
  );

  const accessDenied =
    redesigned &&
    ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(
      messagesQuery.error?.data?.code ?? "",
    );
  const isAgent = peer?.isAgent ?? false;
  // The GIF button shows only once the conversation is known to be with a
  // person: the peer is null while the conversation list loads, and stays
  // null when this conversation is not in the list's first page.
  const composerKind = peer && !peer.isAgent ? "person" : "agent";

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-chat-conversation={redesigned ? "" : undefined}
    >
      {/* Header — hidden when the parent supplies its own (e.g. room header). */}
      {!hideHeader && (
        <div
          className={cn(
            "border-border flex items-center gap-2 border-b px-4 py-3",
            redesigned && "min-h-16 shrink-0 py-2 sm:gap-3 sm:px-5",
          )}
        >
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className={cn(
                "text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring -ml-1 rounded-md p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none lg:hidden",
                redesigned && "grid size-11 place-items-center lg:hidden",
              )}
              aria-label={t("back")}
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
          )}
          {redesigned ? (
            <ChatAvatar
              name={peer?.name}
              image={peer?.image}
              kind={roomAuthors ? "room" : isAgent ? "agent" : "person"}
            />
          ) : (
            <div className="relative shrink-0">
              <Avatar>
                {peer?.image && (
                  <AvatarImage src={peer.image} alt={peer.name} />
                )}
                <AvatarFallback>
                  {getInitials(peer?.name ?? "?")}
                </AvatarFallback>
              </Avatar>
              {isAgent && (
                <span className="bg-background absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full">
                  <BotIcon className="text-muted-foreground h-3 w-3" />
                </span>
              )}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {redesigned ? (
              peer ? (
                <h2 dir="auto" className="truncate text-base font-semibold">
                  {peer.name}
                </h2>
              ) : (
                <Skeleton className="h-4 w-24" />
              )
            ) : (
              <p className="text-foreground truncate text-sm font-semibold">
                {peer?.name ?? "—"}
              </p>
            )}
            {isAgent && agentLastActiveAt ? (
              <p className="text-muted-foreground truncate text-xs">
                {t("lastActive")}{" "}
                <RelativeTime
                  date={agentLastActiveAt}
                  className="text-muted-foreground text-xs"
                />
              </p>
            ) : redesigned && peer ? (
              <p className="text-muted-foreground truncate text-xs">
                {roomHref
                  ? chat("roomType")
                  : isAgent
                    ? chat("agentConversation")
                    : chat("directMessage")}
              </p>
            ) : null}
          </div>
          {redesigned && roomHref ? (
            <Button variant="ghost" className="min-h-11 min-w-11" asChild>
              <Link href={roomHref}>
                <ArrowUpRightIcon aria-hidden />
                <span className="sr-only sm:not-sr-only">
                  {chat("openRoom")}
                </span>
              </Link>
            </Button>
          ) : null}
          {onToggleProfile && (
            <button
              type="button"
              onClick={onToggleProfile}
              className={cn(
                "text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring rounded-md p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none",
                redesigned &&
                  "aria-expanded:bg-muted grid size-11 place-items-center",
              )}
              aria-label={profileExpanded ? t("hideProfile") : t("showProfile")}
              title={profileExpanded ? t("hideProfile") : t("showProfile")}
              aria-expanded={profileExpanded}
            >
              <PanelRightIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {redesigned && showConnectionStatus ? <ConnectionStatus /> : null}

      {/* Messages */}
      {redesigned && messagesQuery.isError ? (
        <ErrorState
          className="flex-1"
          title={chat(
            accessDenied ? "conversationUnavailable" : "messagesError",
          )}
          description={chat(
            accessDenied ? "conversationUnavailableHint" : "messagesErrorHint",
          )}
          onRetry={() => void messagesQuery.refetch()}
        />
      ) : messagesQuery.isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <MessageSquareIcon className="text-muted-foreground h-8 w-8" />
          <p className="text-muted-foreground text-sm">{t("loadError")}</p>
          <button
            type="button"
            onClick={() => void messagesQuery.refetch()}
            className="text-primary focus-visible:ring-ring rounded text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {t("retry")}
          </button>
        </div>
      ) : messagesQuery.isLoading ? (
        <div
          aria-busy={redesigned || undefined}
          className={cn(
            "flex flex-1 flex-col gap-6 p-4",
            redesigned && "min-h-0 overflow-hidden",
          )}
        >
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
        <Conversation
          className={redesigned ? "min-h-0 flex-1" : "flex-1"}
          {...(redesigned
            ? {
                initial: messagesQuery.firstUnreadId ? false : "instant",
                resize: "instant",
                "aria-label": chat("transcript"),
              }
            : {})}
        >
          <ConversationContent
            className={cn(
              "gap-4 p-4 sm:px-6",
              redesigned && "mx-auto w-full max-w-4xl gap-3 sm:px-7",
            )}
          >
            {isAgent && messages.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <BotIcon className="text-muted-foreground h-8 w-8" />
                <p className="text-foreground text-sm font-medium">
                  {t("agentEmptyTitle")}
                </p>
                <p className="text-muted-foreground max-w-xs text-sm">
                  {t("agentEmptyDescription")}
                </p>
                {redesigned ? (
                  <Button
                    asChild
                    variant="outline"
                    className="min-h-11 shadow-none"
                  >
                    <Link href="/dashboard/agent">{t("agentEmptyCta")}</Link>
                  </Button>
                ) : (
                  <Link
                    href="/dashboard/agent"
                    className="text-primary focus-visible:ring-ring rounded text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {t("agentEmptyCta")}
                  </Link>
                )}
              </div>
            )}
            {!isAgent && messages.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <MessageSquareIcon className="text-muted-foreground h-8 w-8" />
                <p className="text-foreground text-sm font-medium">
                  {redesigned && roomAuthors
                    ? chat("roomEmpty")
                    : t("sayHello")}
                </p>
                <p className="text-muted-foreground max-w-xs text-sm">
                  {redesigned && roomAuthors
                    ? chat("roomEmptyHint")
                    : t("sayHelloDescription")}
                </p>
              </div>
            )}
            {redesigned && roomAuthors && messages.length > 0 ? (
              <RoomTranscript
                messages={messages}
                conversationId={conversationId}
                authors={roomAuthors}
                viewer={viewer}
                viewerAvatarUrl={messagesQuery.data?.viewerAvatarUrl}
                firstUnreadId={messagesQuery.firstUnreadId}
              />
            ) : redesigned ? (
              <ChatTranscript
                messages={messages}
                conversationId={conversationId}
                viewerId={viewer?.id}
                firstUnreadId={messagesQuery.firstUnreadId}
                resolveAuthor={(message) =>
                  message.senderId === viewer?.id &&
                  message.senderType === "human"
                    ? {
                        name: chat("you"),
                        avatarName: viewer.name ?? undefined,
                        image:
                          messagesQuery.data?.viewerAvatarUrl ??
                          viewer.image ??
                          null,
                      }
                    : peer
                }
              />
            ) : (
              messages.map((msg, idx) => {
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
                    <UnattributedMessage
                      message={msg}
                      conversationId={conversationId}
                      isUser={isUser}
                    />
                  </div>
                );
              })
            )}
          </ConversationContent>
          {redesigned ? <TranscriptViewportPosition /> : null}
          <ConversationScrollButton
            aria-label={redesigned ? chat("latestMessages") : undefined}
            className={redesigned ? "size-11" : undefined}
          />
        </Conversation>
      )}

      {/* Composer */}
      <div
        hidden={accessDenied}
        className={cn(
          "border-border border-t p-3 **:data-[slot=input-group]:rounded-lg",
          redesigned &&
            "bg-background shrink-0 **:data-[chat-send]:size-11 **:data-[chat-send]:rounded-md **:data-[slot=input-group]:shadow-none sm:px-6 max-sm:**:data-[chat-toolbar]:[&_button]:size-11 [&_form]:mx-auto [&_form]:max-w-4xl",
        )}
      >
        <MessageComposer
          conversationId={conversationId}
          placeholder={t("placeholder")}
          kind={composerKind}
          redesigned={redesigned}
        />
      </div>
    </div>
  );
}
