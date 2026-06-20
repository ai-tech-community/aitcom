"use client";

import { useMemo, useState } from "react";
import {
  BotIcon,
  CheckCheckIcon,
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
import { cn } from "@/lib/utils";

type Conversation =
  RouterOutputs["inbox"]["listConversations"]["conversations"][number];

type ConversationListProps = {
  activeConversationId?: string;
  onNewMessage: () => void;
  /** Called when a conversation row is activated (mobile pane switch). */
  onSelect?: (id: string) => void;
};

function conversationName(
  conv: Conversation,
  agentFallback: string,
): { name: string; image: string | null; isAgent: boolean } {
  const isAgent = conv.type === "agent";
  if (isAgent) {
    return {
      name: conv.agentInfo?.name ?? agentFallback,
      image: conv.agentInfo?.avatar ?? null,
      isAgent: true,
    };
  }
  return {
    name: conv.participants[0]?.displayName ?? "Unknown",
    image: conv.participants[0]?.image ?? null,
    isAgent: false,
  };
}

export function ConversationList({
  activeConversationId,
  onNewMessage,
  onSelect,
}: ConversationListProps) {
  const t = useTranslations("inbox");
  const utils = api.useUtils();
  const [tab, setTab] = useState<"inbox" | "unread">("inbox");
  const [search, setSearch] = useState("");

  const conversationsQuery = api.inbox.listConversations.useQuery(
    { limit: 30, cursor: null },
    { refetchInterval: LIVE_MESSAGES_FALLBACK_MS },
  );

  const conversations = useMemo(
    () => conversationsQuery.data?.conversations ?? [],
    [conversationsQuery.data],
  );

  const hasUnread = conversations.some((c) => c.unreadCount > 0);

  const filtered = useMemo(() => {
    let list = conversations;
    if (tab === "unread") list = list.filter((c) => c.unreadCount > 0);
    if (search.trim().length > 0) {
      const q = search.toLowerCase();
      list = list.filter((c) => {
        const { name } = conversationName(c, t("agentLabel"));
        return name.toLowerCase().includes(q);
      });
    }
    return list;
  }, [conversations, tab, search, t]);

  async function handleMarkAllRead() {
    // Selecting (opening) a conversation marks it read server-side; the cheapest
    // way to mark all is to read each unread conversation's messages then refresh.
    const unread = conversations.filter((c) => c.unreadCount > 0);
    await Promise.all(
      unread.map((c) =>
        utils.inbox.getMessages.fetch({ conversationId: c.id, limit: 50 }),
      ),
    );
    await Promise.all([
      utils.inbox.listConversations.invalidate(),
      utils.inbox.totalUnreadCount.invalidate(),
    ]);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
        <SectionLabel bordered={false}>{t("messagesKicker")}</SectionLabel>
        <div className="flex items-center gap-1">
          {hasUnread && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring rounded-md p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              aria-label={t("markAllRead")}
              title={t("markAllRead")}
            >
              <CheckCheckIcon className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onNewMessage}
            className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring rounded-md p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label={t("newMessage")}
            title={t("newMessage")}
          >
            <PenSquareIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="border-border flex flex-col gap-2 border-b px-3 py-2.5">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "inbox" | "unread")}
        >
          <TabsList variant="line" className="w-full justify-start">
            <TabsTrigger value="inbox" className="font-mono text-xs">
              {t("inboxTab")}
            </TabsTrigger>
            <TabsTrigger value="unread" className="font-mono text-xs">
              {t("unreadTab")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="bg-secondary focus-within:ring-ring flex items-center gap-2 rounded-full px-3 py-1.5 transition-shadow focus-within:ring-2">
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
        {conversationsQuery.isLoading ? (
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
        ) : (
          <ul className="flex flex-col px-1.5" role="list">
            {filtered.map((conv) => {
              const { name, image, isAgent } = conversationName(
                conv,
                t("agentLabel"),
              );
              const isActive = conv.id === activeConversationId;
              const unread = conv.unreadCount > 0;
              const previewSender =
                conv.lastMessage?.senderType === "agent" ? "Agent: " : "";
              return (
                <li key={conv.id}>
                  <Link
                    href={`/messages/${conv.id}`}
                    onClick={() => onSelect?.(conv.id)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "group focus-visible:ring-ring relative flex items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none",
                      isActive
                        ? "bg-secondary"
                        : "hover:bg-secondary/60",
                    )}
                  >
                    {/* Active marker — Signal Orange rounded indicator (not a side-stripe). */}
                    {isActive && (
                      <span
                        aria-hidden
                        className="bg-primary absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-full"
                      />
                    )}
                    <div className="relative shrink-0">
                      <Avatar size="lg">
                        {image && <AvatarImage src={image} alt={name} />}
                        <AvatarFallback>{getInitials(name)}</AvatarFallback>
                      </Avatar>
                      {isAgent && (
                        <span className="bg-background absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full">
                          <BotIcon className="text-muted-foreground h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "text-foreground truncate text-sm",
                            unread ? "font-semibold" : "font-medium",
                          )}
                        >
                          {name}
                        </span>
                        {conv.lastMessage?.createdAt && (
                          <RelativeTime
                            date={conv.lastMessage.createdAt}
                            className="text-muted-foreground ml-1 shrink-0 text-xs"
                          />
                        )}
                      </div>
                      {conv.lastMessage?.content && (
                        <p
                          className={cn(
                            "truncate text-xs",
                            unread
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {previewSender}
                          {conv.lastMessage.content}
                        </p>
                      )}
                    </div>
                    {unread && (
                      <span
                        className="bg-primary h-2.5 w-2.5 shrink-0 rounded-full"
                        aria-label={t("unreadBadge")}
                      />
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
