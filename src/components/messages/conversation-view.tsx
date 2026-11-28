"use client";

import { useLayoutEffect, useMemo } from "react";
import {
  ArrowLeftIcon,
  BotIcon,
  MessageSquareIcon,
  PanelRightIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { authClient } from "@/server/better-auth/client";
import {
  useInitialAuthUser,
  usePageDocumentAuthUser,
} from "@/components/auth/session-provider";
import {
  documentAuthUser,
  type HubAuthUser,
} from "@/server/better-auth/hub-session";
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
import { api, type RouterOutputs } from "@/trpc/react";

type RoomAuthor = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
};

type RoomAuthors = { slug: string; previews: readonly RoomAuthor[] };
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
  roomViewport?: boolean;
  roomAuthors?: RoomAuthors;
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

const ROOM_GROUP_GAP = 5 * 60 * 1000;

export function groupRoomMessages<
  T extends Pick<ChatMessage, "senderId" | "senderType" | "createdAt">,
>(messages: readonly T[]) {
  const groups: T[][] = [];
  for (const message of messages) {
    const group = groups.at(-1);
    const preceding = group?.at(-1);
    if (
      group &&
      preceding &&
      preceding.senderId === message.senderId &&
      preceding.senderType === message.senderType &&
      toDateKey(preceding.createdAt) === toDateKey(message.createdAt) &&
      message.createdAt.getTime() - preceding.createdAt.getTime() <
        ROOM_GROUP_GAP
    ) {
      group.push(message);
    } else {
      groups.push([message]);
    }
  }
  return groups;
}

function RoomMessageGroups({
  messages,
  conversationId,
  authors,
  viewer,
}: {
  messages: readonly ChatMessage[];
  conversationId: string;
  authors: RoomAuthors;
  viewer: HubAuthUser | null;
}) {
  const t = useTranslations("redesign.shell");
  const inbox = useTranslations("inbox");
  const byUser = new Map(
    authors.previews.map((author) => [author.userId, author]),
  );
  if (viewer) {
    byUser.set(viewer.id, {
      userId: viewer.id,
      displayName: viewer.name?.trim() || t("roomMessageYou"),
      avatarUrl: viewer.image ?? null,
    });
  }
  const humanSenders = [
    ...new Set(
      messages.flatMap(({ senderId, senderType }) =>
        senderType === "human" ? [senderId] : [],
      ),
    ),
  ];
  const needsRoster = humanSenders.some((id) => !byUser.get(id)?.displayName);
  const roster = api.communities.getMembers.useQuery(
    { slug: authors.slug, limit: 50 },
    { enabled: needsRoster },
  );
  for (const row of roster.data?.items ?? []) {
    if (byUser.get(row.userId)?.displayName) continue;
    byUser.set(row.userId, {
      userId: row.userId,
      displayName: row.displayName,
      avatarUrl: row.image,
    });
  }
  // Room previews and the first roster page are quick, scoped sources. Look
  // up the remaining human IDs through the existing public-profile policy.
  const missing = roster.isLoading
    ? []
    : humanSenders.filter((id) => !byUser.get(id)?.displayName);
  const profiles = api.useQueries((queries) =>
    missing.map((userId) =>
      queries.members.getPublicProfile({ userId }, { retry: false }),
    ),
  );
  profiles.forEach(({ data }, index) => {
    if (!data?.profile.displayName) return;
    const userId = missing[index]!;
    byUser.set(userId, {
      userId,
      displayName: data.profile.displayName,
      avatarUrl: data.user?.avatarUrl ?? null,
    });
  });

  const dateLabel = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (toDateKey(date) === toDateKey(today)) return inbox("today");
    if (toDateKey(date) === toDateKey(yesterday)) return inbox("yesterday");
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    });
  };

  const groups = groupRoomMessages(messages);
  return groups.map((group, index) => {
    const first = group[0]!;
    const previous = groups[index - 1]?.[0];
    // For agent rows, senderId is the owner, not an agent identity.
    const author =
      first.senderType === "human" ? byUser.get(first.senderId) : undefined;
    const name = author?.displayName;
    const startsDay =
      !previous || toDateKey(previous.createdAt) !== toDateKey(first.createdAt);
    return (
      <div
        key={first.id}
        data-room-message=""
        className="flex flex-col gap-3 data-[clipped-room-message]:invisible"
      >
        {startsDay ? (
          <div className="flex items-center gap-3">
            <div className="bg-border h-px flex-1" />
            <span className="text-muted-foreground font-mono text-xs">
              {dateLabel(first.createdAt)}
            </span>
            <div className="bg-border h-px flex-1" />
          </div>
        ) : null}
        {name ? (
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3">
            <Avatar size="sm" aria-hidden>
              {author?.avatarUrl ? (
                <AvatarImage src={author.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback>{getInitials(name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-2">
              <p className="text-sm font-semibold wrap-break-word">{name}</p>
              {group.map((message) => (
                <div key={message.id} className="min-w-0">
                  <MessageBody
                    message={message}
                    isUser={
                      message.senderId === viewer?.id &&
                      message.senderType === "human"
                    }
                    conversationId={conversationId}
                  />
                  <span className="text-muted-foreground font-mono text-xs">
                    {formatTime(message.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          group.map((message) => (
            <UnattributedMessage
              key={message.id}
              message={message}
              conversationId={conversationId}
              isUser={false}
            />
          ))
        )}
      </div>
    );
  });
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

/** At the latest message, keep a partial leading row out of the reading area.
 * The original scroll range stays intact so scrolling back reveals that row. */
function RoomViewportEdge() {
  const { scrollRef, contentRef } = useStickToBottomContext();

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;
    let clipped: HTMLElement | undefined;
    function refresh() {
      if (!scroll || !content) return;
      const latest =
        scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 2;
      const edge = scroll.getBoundingClientRect().top;
      const next = latest
        ? [
            ...content.querySelectorAll<HTMLElement>("[data-room-message]"),
          ].find((row) => {
            const { top, bottom } = row.getBoundingClientRect();
            return (
              top < edge &&
              bottom > edge &&
              row.nextElementSibling?.hasAttribute("data-room-message")
            );
          })
        : undefined;
      if (next === clipped) return;
      clipped?.removeAttribute("data-clipped-room-message");
      clipped = next;
      clipped?.setAttribute("data-clipped-room-message", "");
    }

    const resize = new ResizeObserver(refresh);
    resize.observe(scroll);
    resize.observe(content);
    scroll.addEventListener("scroll", refresh, { passive: true });
    refresh();
    return () => {
      resize.disconnect();
      scroll.removeEventListener("scroll", refresh);
      clipped?.removeAttribute("data-clipped-room-message");
    };
  }, [scrollRef, contentRef]);

  return null;
}

export function ConversationView({
  conversationId,
  peer,
  agentLastActiveAt,
  onToggleProfile,
  onBack,
  hideHeader = false,
  roomViewport = false,
  roomAuthors,
}: ConversationViewProps) {
  const t = useTranslations("inbox");
  const shell = useTranslations("redesign.shell");
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
  const initialUser = useInitialAuthUser();
  const pageUser = usePageDocumentAuthUser();
  const viewer = documentAuthUser(initialUser, pageUser, session?.user);

  const messagesQuery = useConversationMessages(conversationId);

  const messages = useMemo(
    () => messagesQuery.data?.messages ?? [],
    [messagesQuery.data],
  );

  const isAgent = peer?.isAgent ?? false;
  // The GIF button shows only once the conversation is known to be with a
  // person: the peer is null while the conversation list loads, and stays
  // null when this conversation is not in the list's first page.
  const composerKind = peer && !peer.isAgent ? "person" : "agent";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header — hidden when the parent supplies its own (e.g. room header). */}
      {!hideHeader && (
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
          {onToggleProfile && (
            <button
              type="button"
              onClick={onToggleProfile}
              className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring rounded-md p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              aria-label={t("showProfile")}
              title={t("showProfile")}
            >
              <PanelRightIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      {messagesQuery.isError ? (
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
        <Conversation
          className={roomViewport ? "min-h-0 flex-1" : "flex-1"}
          {...(roomViewport ? { initial: "instant", resize: "instant" } : {})}
        >
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
            {roomAuthors && messages.length > 0 ? (
              <RoomMessageGroups
                messages={messages}
                conversationId={conversationId}
                authors={roomAuthors}
                viewer={viewer}
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
                  <div
                    key={msg.id}
                    data-room-message={roomViewport ? "" : undefined}
                    className="flex flex-col gap-4 data-[clipped-room-message]:invisible"
                  >
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
          {roomViewport ? <RoomViewportEdge /> : null}
          <ConversationScrollButton
            aria-label={roomViewport ? shell("latestMessages") : undefined}
          />
        </Conversation>
      )}

      {/* Composer */}
      <div className="border-border border-t p-3 **:data-[slot=input-group]:rounded-lg">
        <MessageComposer
          conversationId={conversationId}
          placeholder={t("placeholder")}
          kind={composerKind}
        />
      </div>
    </div>
  );
}
