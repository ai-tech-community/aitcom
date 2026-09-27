"use client";

import type { ReactNode } from "react";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useInbox } from "./inbox-provider";
import { InboxPill } from "./inbox-pill";
import { InboxList } from "./inbox-list";
import { ChatWindow } from "./chat-window";
import { ChatWindowMinimized } from "./chat-window-minimized";
import { InboxMobileView } from "./inbox-mobile-view";

/**
 * Owns the bottom-right dock. Other signed-in chrome joins the same flex row
 * through `dockLeading` (rendered left of the inbox pill) instead of pinning
 * its own fixed element, so the two can never overlap at any width. The slot
 * is hidden (not unmounted, so its state survives) while the inbox is in use
 * (list, a chat, or minimized chats), when the corner belongs to the
 * conversation.
 */
export function InboxRoot({ dockLeading }: { dockLeading?: ReactNode } = {}) {
  const { data: session } = authClient.useSession();
  const inbox = useInbox();
  const t = useTranslations("inbox");

  // Fetch conversations to map IDs to display info for chat windows
  const { data: conversationsData } = api.inbox.listConversations.useQuery(
    { limit: 20 },
    {
      enabled:
        !!session?.user &&
        (inbox.isListOpen ||
          inbox.openChats.length > 0 ||
          inbox.minimizedChats.length > 0 ||
          inbox.activeChat !== null),
    },
  );

  if (!session?.user) return null;

  const conversations = conversationsData?.conversations ?? [];

  // Helper to get display info for a conversation ID
  function getConvInfo(conversationId: string) {
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return null;
    return {
      conversationId: conv.id,
      displayName: conv.isRoom
        ? (conv.title ?? "Room")
        : conv.type === "agent"
          ? (conv.agentInfo?.name ?? t("agentLabel"))
          : (conv.participants[0]?.displayName ?? "Unknown"),
      image:
        conv.isRoom || conv.type === "agent"
          ? ((conv.type === "agent" ? conv.agentInfo?.avatar : null) ?? null)
          : (conv.participants[0]?.image ?? null),
      isAgent: conv.type === "agent",
    };
  }

  const inboxInUse =
    inbox.isListOpen ||
    inbox.openChats.length > 0 ||
    inbox.minimizedChats.length > 0 ||
    inbox.activeChat !== null;

  // Mobile active chat
  const activeChatInfo = inbox.activeChat
    ? getConvInfo(inbox.activeChat)
    : null;

  return (
    <>
      {/* Mobile fullscreen overlay */}
      {inbox.activeChat && activeChatInfo && (
        <InboxMobileView chatInfo={activeChatInfo} />
      )}

      {/* Fixed bottom-right container for desktop/tablet.
          On mobile when inbox list is open, bump to z-60 so it sits above the sticky navbar (z-50). */}
      <div
        className={cn(
          "fixed right-3 bottom-3 z-40 flex items-end gap-2 sm:right-4 sm:bottom-4",
          inbox.isListOpen && "max-sm:z-60",
        )}
      >
        {/* Other dock items (e.g. the getting-started reminder) */}
        {dockLeading ? (
          <div
            hidden={inboxInUse}
            data-slot="dock-leading"
            className="empty:hidden"
          >
            {dockLeading}
          </div>
        ) : null}

        {/* Minimized chat pills — hidden on mobile (mobile uses fullscreen activeChat) */}
        {inbox.minimizedChats.map((convId) => {
          const info = getConvInfo(convId);
          if (!info) return null;
          return (
            <div key={convId} className="hidden sm:block">
              <ChatWindowMinimized
                conversationId={info.conversationId}
                displayName={info.displayName}
                image={info.image}
                isAgent={info.isAgent}
              />
            </div>
          );
        })}

        {/* Open chat windows */}
        {inbox.openChats.map((convId) => {
          const info = getConvInfo(convId);
          if (!info) return null;
          return (
            <ChatWindow
              key={convId}
              conversationId={info.conversationId}
              displayName={info.displayName}
              image={info.image}
              isAgent={info.isAgent}
            />
          );
        })}

        {/* Inbox list panel */}
        {inbox.isListOpen && <InboxList />}

        {/* Inbox pill (collapsed) */}
        <InboxPill />
      </div>
    </>
  );
}
