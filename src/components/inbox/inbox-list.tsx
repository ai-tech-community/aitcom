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
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Spinner } from "@/components/ui/spinner";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { SectionLabel } from "@/components/ui/section-label";
import { getInitials } from "@/lib/avatar";
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
        "border-border bg-background flex flex-col overflow-hidden rounded-lg border shadow-lg",
        // Desktop / tablet: fixed size
        "max-h-125 w-80",
        // Mobile: fullscreen overlay (z-60 to sit above the sticky navbar at z-50)
        "max-sm:fixed max-sm:inset-0 max-sm:z-60 max-sm:h-full max-sm:max-h-none max-sm:w-full max-sm:rounded-none max-sm:border-0",
      ].join(" ")}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        {mode === "list" ? (
          <>
            <SectionLabel bordered={false}>{t("title")}</SectionLabel>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={enterNewMessageMode}
                className="text-muted-foreground hover:bg-secondary/50 hover:text-foreground rounded-md p-1.5 transition-colors"
                aria-label={t("newMessage")}
              >
                <PenSquareIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={toggleList}
                className="text-muted-foreground hover:bg-secondary/50 hover:text-foreground rounded-md p-1.5 transition-colors"
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
                className="text-muted-foreground hover:bg-secondary/50 hover:text-foreground rounded-md p-1.5 transition-colors"
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </button>
              <SectionLabel bordered={false} marker={false}>
                {t("newMessage")}
              </SectionLabel>
            </div>
          </>
        )}
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className="px-3 py-2">
        <div className="bg-secondary/50 flex items-center gap-2 rounded-full px-3 py-1.5">
          <SearchIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <input
            type="text"
            value={mode === "list" ? search : memberSearch}
            onChange={(e) =>
              mode === "list"
                ? setSearch(e.target.value)
                : setMemberSearch(e.target.value)
            }
            placeholder={mode === "list" ? t("search") : t("searchMembers")}
            className="text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm focus:outline-none"
          />
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {mode === "list" ? (
          // ── Conversation list ────────────────────────────────────────
          conversationsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="text-muted-foreground h-5 w-5" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <BotIcon className="text-muted-foreground h-8 w-8" />
              <p className="text-foreground text-sm font-medium">
                {t("noConversations")}
              </p>
              <p className="text-muted-foreground text-xs">
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
                    lastMessageSenderType={conv.lastMessage?.senderType ?? null}
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
                <p className="text-muted-foreground text-xs">
                  {t("searchMembers")}
                </p>
              </div>
            ) : membersQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="text-muted-foreground h-5 w-5" />
              </div>
            ) : members.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground text-xs">
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
                    className="hover:bg-secondary/50 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
                  >
                    <Avatar size="lg">
                      {member.image && (
                        <AvatarImage
                          src={member.image}
                          alt={member.displayName || "Member avatar"}
                        />
                      )}
                      <AvatarFallback>
                        {getInitials(member.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-foreground truncate text-sm font-medium">
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
