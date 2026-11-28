"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BotIcon,
  CheckCheckIcon,
  HashIcon,
  LockIcon,
  PenSquareIcon,
  SearchIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { api, type RouterOutputs } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RelativeTime } from "@/components/ui/relative-time";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/section-label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getInitials } from "@/lib/avatar";
import { LIVE_MESSAGES_FALLBACK_MS } from "@/components/inbox/live-refetch";
import { messagesQueryInput } from "@/components/inbox/conversation-messages";
import { messagePreview } from "@/components/inbox/message-preview";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { messagesHref } from "@/lib/communities/message-return";
import { ChatAvatar } from "./chat-avatar";
import {
  conversationUnreadCount,
  useShellUnread,
} from "@/components/shells/shell-unread";
import { cn } from "@/lib/utils";

type Conversation =
  RouterOutputs["inbox"]["listConversations"]["conversations"][number];

type ConversationListProps = {
  activeConversationId?: string;
  redesigned?: boolean;
  fromCommunity?: string;
  unreadOnly?: boolean;
  onUnreadChange?: (unread: boolean) => void;
  onNewMessage: () => void;
  /** Called when a conversation row is activated (mobile pane switch). */
  onSelect?: (id: string) => void;
};

function conversationName(
  conv: Conversation,
  agentFallback: string,
  roomFallback = "Room",
  memberFallback = "Unknown",
  redesigned = false,
): { name: string; image: string | null; isAgent: boolean } {
  if (conv.isRoom) {
    return {
      name: conv.title ?? roomFallback,
      image: null,
      isAgent: false,
    };
  }
  const isAgent = conv.type === "agent";
  if (isAgent) {
    return {
      name: conv.agentInfo?.name ?? agentFallback,
      image: conv.agentInfo?.avatar ?? null,
      isAgent: true,
    };
  }
  return {
    name: conv.participants[0]?.displayName ?? memberFallback,
    image:
      (redesigned ? conv.participants[0]?.avatarUrl : undefined) ??
      conv.participants[0]?.image ??
      null,
    isAgent: false,
  };
}

export function ConversationList({
  activeConversationId,
  onNewMessage,
  onSelect,
  redesigned = false,
  fromCommunity,
  unreadOnly = false,
  onUnreadChange,
}: ConversationListProps) {
  const t = useTranslations("inbox");
  const chat = useTranslations("redesign.chat");
  const tMedia = useTranslations("media");
  const utils = api.useUtils();
  const [tab, setTab] = useState<"inbox" | "unread">(
    unreadOnly ? "unread" : "inbox",
  );
  useEffect(() => setTab(unreadOnly ? "unread" : "inbox"), [unreadOnly]);
  const { conversationRows, readThrough } = useShellUnread();
  const [search, setSearch] = useState("");
  const [markingRead, setMarkingRead] = useState(false);

  const conversationsQuery = api.inbox.listConversations.useQuery(
    { limit: 30, cursor: null },
    { refetchInterval: LIVE_MESSAGES_FALLBACK_MS },
  );

  const conversations = useMemo(
    () => conversationsQuery.data?.conversations ?? [],
    [conversationsQuery.data],
  );

  const visibleUnread = useMemo(() => {
    const byId = new Map(conversations.map((row) => [row.id, row]));
    if (redesigned) {
      for (const row of conversationRows) {
        if (!byId.has(row.id)) byId.set(row.id, row);
      }
    }
    return [...byId.values()].flatMap((row) => {
      const count = redesigned
        ? conversationUnreadCount(row, readThrough)
        : row.unreadCount;
      return count ? [{ ...row, unreadCount: count }] : [];
    });
  }, [conversations, conversationRows, readThrough, redesigned]);
  const hasUnread = visibleUnread.length > 0;

  const filtered = useMemo(() => {
    const rows = tab === "unread" ? visibleUnread : conversations;
    if (!search.trim().length) return rows;

    const q = (redesigned ? search.trim() : search).toLowerCase();
    return rows.filter((c) => {
      const { name } = conversationName(
        c,
        t("agentLabel"),
        redesigned ? chat("roomType") : undefined,
        redesigned ? chat("member") : undefined,
        redesigned,
      );
      return name.toLowerCase().includes(q);
    });
  }, [conversations, visibleUnread, tab, search, t, chat, redesigned]);

  function changeTab(next: "inbox" | "unread") {
    setTab(next);
    onUnreadChange?.(next === "unread");
  }

  async function handleMarkAllRead() {
    // Selecting (opening) a conversation marks it read server-side; the cheapest
    // way to mark all is to read each unread conversation's messages then refresh.
    const mark = async () => {
      await Promise.all(
        visibleUnread.map((conversation) =>
          utils.inbox.getMessages.fetch(messagesQueryInput(conversation.id)),
        ),
      );
      await Promise.all([
        utils.inbox.listConversations.invalidate(),
        utils.inbox.totalUnreadCount.invalidate(),
      ]);
    };
    if (!redesigned) return mark();
    setMarkingRead(true);
    try {
      await mark();
    } catch {
      toast.error(chat("markReadError"));
    } finally {
      setMarkingRead(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div
        className={cn(
          "border-border flex items-center justify-between gap-2 border-b px-4 py-3",
          redesigned && "min-h-16 flex-wrap justify-end border-0 py-2",
        )}
      >
        {!redesigned ? (
          <SectionLabel bordered={false}>{t("messagesKicker")}</SectionLabel>
        ) : null}
        <div className="flex items-center gap-1">
          {hasUnread && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingRead}
              className={cn(
                "text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring rounded-md p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none",
                redesigned &&
                  "grid size-11 place-items-center disabled:opacity-50",
              )}
              aria-label={t("markAllRead")}
              title={t("markAllRead")}
            >
              <CheckCheckIcon className="h-4 w-4" />
            </button>
          )}
          {redesigned ? (
            <Button
              type="button"
              variant="ink"
              className="min-h-11 shadow-none"
              onClick={onNewMessage}
            >
              <PenSquareIcon aria-hidden />
              {chat("write")}
            </Button>
          ) : (
            <button
              type="button"
              onClick={onNewMessage}
              className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring rounded-md p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              aria-label={t("newMessage")}
              title={t("newMessage")}
            >
              <PenSquareIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs + search */}
      <div
        className={cn(
          "border-border flex flex-col gap-2 border-b px-3 py-2.5",
          redesigned && "flex-col-reverse gap-2 px-4 pt-0 pb-0",
        )}
      >
        <Tabs
          value={tab}
          onValueChange={(v) => changeTab(v as "inbox" | "unread")}
        >
          <TabsList
            variant="line"
            className="w-full justify-start"
            aria-label={t("filterLabel")}
          >
            <TabsTrigger
              value="inbox"
              className={
                redesigned ? "min-h-11 font-sans" : "font-mono text-xs"
              }
            >
              {t("inboxTab")}
            </TabsTrigger>
            <TabsTrigger
              value="unread"
              className={
                redesigned ? "min-h-11 font-sans" : "font-mono text-xs"
              }
            >
              {t("unreadTab")}
              {redesigned && hasUnread ? (
                <span
                  className="font-mono text-xs"
                  aria-label={chat("unreadConversations", {
                    count: visibleUnread.length,
                  })}
                >
                  {visibleUnread.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div
          className={cn(
            "bg-secondary focus-within:ring-ring flex items-center gap-2 rounded-full px-3 py-1.5 transition-shadow focus-within:ring-2",
            redesigned && "bg-background min-h-11 rounded-md border",
          )}
        >
          <SearchIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm focus:outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {conversationsQuery.isError ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <p className="text-muted-foreground text-sm">{t("loadError")}</p>
            <button
              type="button"
              onClick={() => void conversationsQuery.refetch()}
              className="text-primary focus-visible:ring-ring rounded text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              {t("retry")}
            </button>
          </div>
        ) : conversationsQuery.isLoading ? (
          <ul className="flex flex-col">
            {Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center gap-3 px-3 py-2.5"
                aria-hidden
              >
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </li>
            ))}
          </ul>
        ) : filtered.length === 0 ? (
          redesigned ? (
            <div className="space-y-3 px-4 py-6">
              <p className="text-sm font-semibold">
                {chat(
                  search.trim()
                    ? "searchEmpty"
                    : tab === "unread"
                      ? "caughtUp"
                      : "inboxEmpty",
                )}
              </p>
              <p className="text-muted-foreground text-sm">
                {chat(
                  search.trim()
                    ? "searchEmptyHint"
                    : tab === "unread"
                      ? "caughtUpHint"
                      : "inboxEmptyHint",
                )}
              </p>
              {search.trim() || tab === "unread" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 shadow-none"
                  onClick={
                    search.trim()
                      ? () => setSearch("")
                      : () => changeTab("inbox")
                  }
                >
                  {search.trim() ? chat("clearSearch") : t("inboxTab")}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <BotIcon className="text-muted-foreground h-8 w-8" />
              <p className="text-foreground text-sm font-medium">
                {tab === "unread" ? t("unreadTab") : t("noConversations")}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("noConversationsDescription")}
              </p>
              <button
                type="button"
                onClick={onNewMessage}
                className="text-primary focus-visible:ring-ring rounded text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                {t("newMessage")}
              </button>
            </div>
          )
        ) : (
          <ul
            className={cn(
              "flex flex-col px-1.5",
              redesigned && "divide-border divide-y px-0",
            )}
            role="list"
          >
            {filtered.map((conv) => {
              const { name, image, isAgent } = conversationName(
                conv,
                t("agentLabel"),
                redesigned ? chat("roomType") : undefined,
                redesigned ? chat("member") : undefined,
                redesigned,
              );
              const isRoom = conv.isRoom;
              const isPrivateRoom = isRoom && conv.roomVisibility === "private";
              const isActive = conv.id === activeConversationId;
              const unreadCount = redesigned
                ? conversationUnreadCount(conv, readThrough)
                : conv.unreadCount;
              const unread = unreadCount > 0;
              const previewSender =
                conv.lastMessage?.senderType === "agent" && !redesigned
                  ? "Agent: "
                  : "";
              const preview = messagePreview(
                conv.lastMessage,
                tMedia("gifBadge"),
              );
              return (
                <li key={conv.id}>
                  <Link
                    href={messagesHref(
                      conv.id,
                      fromCommunity,
                      redesigned && tab === "unread",
                    )}
                    onClick={() => onSelect?.(conv.id)}
                    aria-current={
                      isActive ? (redesigned ? "page" : "true") : undefined
                    }
                    className={cn(
                      "group focus-visible:ring-ring relative flex items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none",
                      isActive ? "bg-secondary" : "hover:bg-secondary/60",
                      redesigned &&
                        "min-h-17 rounded-none px-4 focus-visible:ring-inset",
                      redesigned && unread && !isActive && "bg-muted/45",
                    )}
                  >
                    {/* Active marker — Signal Orange rounded indicator (not a side-stripe). */}
                    {isActive && (
                      <span
                        aria-hidden
                        className={cn(
                          "bg-primary absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-full",
                          redesigned && "bg-foreground h-8 w-0.5",
                        )}
                      />
                    )}
                    {redesigned ? (
                      <ChatAvatar
                        name={name}
                        image={image}
                        size="lg"
                        kind={
                          isPrivateRoom
                            ? "private-room"
                            : isRoom
                              ? "room"
                              : isAgent
                                ? "agent"
                                : "person"
                        }
                      />
                    ) : (
                      <div className="relative shrink-0">
                        {isRoom ? (
                          <span className="bg-secondary border-border text-muted-foreground flex size-10 items-center justify-center rounded-full border">
                            <HashIcon className="h-4 w-4" />
                          </span>
                        ) : (
                          <Avatar size="lg">
                            {image && <AvatarImage src={image} alt={name} />}
                            <AvatarFallback>{getInitials(name)}</AvatarFallback>
                          </Avatar>
                        )}
                        {isAgent && (
                          <span className="bg-background absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full">
                            <BotIcon className="text-muted-foreground h-3 w-3" />
                          </span>
                        )}
                        {isPrivateRoom && (
                          <span className="bg-background absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full">
                            <LockIcon className="text-muted-foreground h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          dir={redesigned ? "auto" : undefined}
                          className={cn(
                            "text-foreground truncate text-sm",
                            unread
                              ? redesigned
                                ? "font-bold"
                                : "font-semibold"
                              : "font-medium",
                          )}
                        >
                          {name}
                        </span>
                        {conv.lastMessage?.createdAt && (
                          <RelativeTime
                            date={conv.lastMessage.createdAt}
                            className={cn(
                              "text-muted-foreground ml-1 shrink-0 text-xs",
                              redesigned && "font-mono",
                            )}
                          />
                        )}
                      </div>
                      {preview && (
                        <p
                          className={cn(
                            "truncate text-xs",
                            redesigned && unread && "font-medium",
                            unread
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {redesigned &&
                          conv.lastMessage?.senderType === "agent" ? (
                            <>
                              {chat("agent")}
                              {" · "}
                            </>
                          ) : (
                            previewSender
                          )}
                          {preview}
                        </p>
                      )}
                    </div>
                    {redesigned && unread ? (
                      <span
                        className="bg-foreground text-background grid min-w-5 shrink-0 place-items-center rounded-md px-1 py-0.5 font-mono text-xs"
                        aria-label={chat("unreadMessages", {
                          count: unreadCount,
                        })}
                      >
                        {unreadCount}
                      </span>
                    ) : (
                      unread && (
                        <span
                          className="bg-primary h-2.5 w-2.5 shrink-0 rounded-full"
                          aria-label={t("unreadBadge")}
                        />
                      )
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
