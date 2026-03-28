"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  PenSquareIcon,
  SearchIcon,
  ArrowLeftIcon,
  BotIcon,
  XIcon,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Spinner } from "@/components/ui/spinner";
import { InboxConversationItem } from "./inbox-conversation-item";
import { useInbox } from "./inbox-provider";

export function InboxList() {
  const { data: session } = authClient.useSession();
  const { isListOpen, toggleList, openChat } = useInbox();
  const t = useTranslations("inbox");
  const utils = api.useUtils();

  const [mode, setMode] = useState<"list" | "new">("list");
  const [search, setSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────

  const conversationsQuery = api.inbox.listConversations.useQuery(
    { limit: 20, cursor: null },
    { enabled: !!session?.user && isListOpen },
  );

  const membersQuery = api.inbox.searchMembers.useQuery(
    { query: memberSearch },
    { enabled: !!session?.user && mode === "new" && memberSearch.length > 0 },
  );

  const startConversation = api.inbox.startConversation.useMutation({
    onSuccess: async (data) => {
      await utils.inbox.listConversations.invalidate();
      openChat(data.conversationId);
      setMode("list");
      setMemberSearch("");
    },
  });

  // ── Guards ───────────────────────────────────────────────────────────────

  if (!session?.user || !isListOpen) return null;

  // ── Derived data ─────────────────────────────────────────────────────────

  const conversations = conversationsQuery.data?.conversations ?? [];

  const filteredConversations =
    search.length > 0
      ? conversations.filter((conv) => {
          const name =
            conv.type === "agent"
              ? conv.agentInfo?.name
              : conv.participants[0]?.displayName;
          return name?.toLowerCase().includes(search.toLowerCase());
        })
      : conversations;

  const members = membersQuery.data?.members ?? [];

  // ── Mode helpers ─────────────────────────────────────────────────────────

  function enterNewMessageMode() {
    setMode("new");
    setSearch("");
    setMemberSearch("");
  }

  function exitNewMessageMode() {
    setMode("list");
    setMemberSearch("");
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className={[
        "flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg",
        // Desktop / tablet: fixed size
        "w-80 max-h-125",
        // Mobile: fullscreen overlay (z-60 to sit above the sticky navbar at z-50)
        "max-sm:fixed max-sm:inset-0 max-sm:z-60 max-sm:h-full max-sm:max-h-none max-sm:w-full max-sm:rounded-none max-sm:border-0",
      ].join(" ")}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        {mode === "list" ? (
          <>
            <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              / {t("title")}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={enterNewMessageMode}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                aria-label={t("newMessage")}
              >
                <PenSquareIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={toggleList}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                aria-label={t("close")}
              >
                {/* X on mobile (fullscreen), chevron on desktop (panel) */}
                <XIcon className="h-4 w-4 sm:hidden" />
                <ChevronDownIcon className="hidden h-4 w-4 sm:block" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exitNewMessageMode}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </button>
              <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("newMessage")}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 rounded-full bg-secondary/50 px-3 py-1.5">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={mode === "list" ? search : memberSearch}
            onChange={(e) =>
              mode === "list"
                ? setSearch(e.target.value)
                : setMemberSearch(e.target.value)
            }
            placeholder={
              mode === "list" ? t("search") : t("searchMembers")
            }
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {mode === "list" ? (
          // ── Conversation list ────────────────────────────────────────
          conversationsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-5 w-5 text-muted-foreground" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <BotIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                {t("noConversations")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("noConversationsDescription")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col py-1">
              {filteredConversations.map((conv) => {
                const isAgent = conv.type === "agent";
                const displayName = isAgent
                  ? (conv.agentInfo?.name ?? t("agentLabel"))
                  : (conv.participants[0]?.displayName ?? "Unknown");
                const image = isAgent
                  ? null
                  : (conv.participants[0]?.image ?? null);
                const agentAvatar = isAgent
                  ? (conv.agentInfo?.avatar ?? null)
                  : undefined;

                return (
                  <InboxConversationItem
                    key={conv.id}
                    id={conv.id}
                    type={conv.type as "agent" | "dm"}
                    displayName={displayName}
                    image={image}
                    agentAvatar={agentAvatar}
                    lastMessage={conv.lastMessage?.content ?? null}
                    lastMessageSenderType={
                      conv.lastMessage?.senderType ?? null
                    }
                    lastMessageAt={
                      conv.lastMessage?.createdAt
                        ? String(conv.lastMessage.createdAt)
                        : null
                    }
                    unreadCount={conv.unreadCount}
                  />
                );
              })}
            </div>
          )
        ) : (
          // ── New message: member search results ───────────────────────
          <>
            {memberSearch.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-xs text-muted-foreground">
                  {t("searchMembers")}
                </p>
              </div>
            ) : membersQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="h-5 w-5 text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-xs text-muted-foreground">
                  {t("noConversations")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col py-1">
                {members.map((member) => (
                  <button
                    key={member.userId}
                    type="button"
                    disabled={startConversation.isPending}
                    onClick={() =>
                      startConversation.mutate({
                        recipientId: member.userId,
                      })
                    }
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary/50"
                  >
                    {member.image ? (
                      <Image
                        src={member.image}
                        alt={member.displayName || "Member avatar"}
                        width={40}
                        height={40}
                        unoptimized
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-medium text-muted-foreground">
                        {member.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="truncate text-sm font-medium text-foreground">
                      {member.displayName}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
