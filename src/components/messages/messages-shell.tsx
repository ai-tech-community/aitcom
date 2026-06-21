"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquareIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { useInboxStream } from "@/components/inbox/use-inbox-stream";
import { LIVE_MESSAGES_FALLBACK_MS } from "@/components/inbox/live-refetch";
import { cn } from "@/lib/utils";
import { ConversationList } from "./conversation-list";
import { ConversationView } from "./conversation-view";
import { ProfilePane, RoomInfoPane } from "./profile-pane";
import { NewMessage } from "./new-message";

type MessagesShellProps = {
  activeConversationId?: string;
};

export function MessagesShell({ activeConversationId }: MessagesShellProps) {
  const t = useTranslations("inbox");

  // Subscribe to realtime once for the whole page.
  useInboxStream();

  // Docked profile pane (xl+) shows by default. The overlay (< xl) only opens
  // when the user explicitly toggles it on, so it never pops on first load.
  const [dockedProfile, setDockedProfile] = useState(true);
  const [overlayProfile, setOverlayProfile] = useState(false);
  const [composing, setComposing] = useState(false);
  // Mobile: which pane is foregrounded when a conversation is active.
  const [mobileView, setMobileView] = useState<"list" | "conversation">(
    activeConversationId ? "conversation" : "list",
  );

  useEffect(() => {
    setMobileView(activeConversationId ? "conversation" : "list");
    setComposing(false);
    setOverlayProfile(false);
  }, [activeConversationId]);

  // The header toggle flips the docked pane (xl+) and the overlay (< xl) together;
  // CSS visibility classes ensure only the size-appropriate one is rendered.
  function toggleProfile() {
    setDockedProfile((v) => !v);
    setOverlayProfile((v) => !v);
  }

  // Resolve the active conversation's peer for the header + profile pane.
  const conversationsQuery = api.inbox.listConversations.useQuery(
    { limit: 30, cursor: null },
    { refetchInterval: LIVE_MESSAGES_FALLBACK_MS },
  );

  const active = useMemo(
    () =>
      conversationsQuery.data?.conversations.find(
        (c) => c.id === activeConversationId,
      ) ?? null,
    [conversationsQuery.data, activeConversationId],
  );

  const isAgent = active?.type === "agent";
  const isRoom = active?.isRoom ?? false;
  const peer = active
    ? isRoom
      ? {
          name: active.title ?? "Room",
          image: null,
          isAgent: false,
        }
      : isAgent
        ? {
            name: active.agentInfo?.name ?? t("agentLabel"),
            image: active.agentInfo?.avatar ?? null,
            isAgent: true,
          }
        : {
            name: active.participants[0]?.displayName ?? "Unknown",
            image: active.participants[0]?.image ?? null,
            isAgent: false,
          }
    : null;

  // Rooms have no single peer profile to show in the docked profile pane.
  const peerUserId =
    active && !isAgent && !isRoom
      ? (active.participants[0]?.userId ?? null)
      : null;

  return (
    <div className="bg-background border-border mx-auto h-[calc(100dvh-3rem)] max-w-7xl border-x">
      <div className="flex h-full min-h-0">
        {/* ── Left: conversation list / new-message ───────────────────── */}
        <aside
          aria-label={t("messagesKicker")}
          className={cn(
            "border-border bg-background flex w-full flex-col border-r lg:w-80 lg:shrink-0",
            // On <lg, the list takes the full width unless a conversation is foregrounded.
            activeConversationId && mobileView === "conversation"
              ? "hidden lg:flex"
              : "flex",
          )}
        >
          {composing ? (
            <NewMessage
              onCancel={() => setComposing(false)}
              onStarted={() => setComposing(false)}
            />
          ) : (
            <ConversationList
              activeConversationId={activeConversationId}
              onNewMessage={() => setComposing(true)}
              onSelect={() => setMobileView("conversation")}
            />
          )}
        </aside>

        {/* ── Center: conversation view ───────────────────────────────── */}
        <section
          aria-label={t("title")}
          className={cn(
            "min-w-0 flex-1 flex-col",
            !activeConversationId && "hidden lg:flex",
            activeConversationId && mobileView === "conversation"
              ? "flex"
              : "hidden lg:flex",
          )}
        >
          {activeConversationId ? (
            <ConversationView
              key={activeConversationId}
              conversationId={activeConversationId}
              peer={peer}
              agentLastActiveAt={
                isAgent ? active?.agentInfo?.lastActiveAt : null
              }
              onToggleProfile={toggleProfile}
              onBack={() => setMobileView("list")}
            />
          ) : (
            <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <MessageSquareIcon className="text-muted-foreground h-9 w-9" />
              <p className="text-foreground text-sm font-medium">
                {t("selectConversation")}
              </p>
              <p className="text-muted-foreground max-w-sm text-sm">
                {t("selectConversationDescription")}
              </p>
            </div>
          )}
        </section>

        {/* ── Right: docked profile pane (xl+, collapsible) ───────────── */}
        {activeConversationId && dockedProfile && (
          <aside
            aria-label={t("profileKicker")}
            className={cn(
              "border-border bg-background w-80 shrink-0 flex-col border-l",
              // Docked only at xl+; under xl the profile is an overlay (below).
              "hidden xl:flex",
            )}
          >
            {isRoom ? (
              <RoomInfoPane
                roomName={active?.title ?? "Room"}
                roomVisibility={active?.roomVisibility ?? null}
                memberCount={active?.memberCount ?? 0}
                communityName={active?.communityName ?? null}
                communityLogoUrl={active?.communityLogoUrl ?? null}
                communitySlug={active?.communitySlug ?? null}
                roomSlug={active?.roomSlug ?? null}
              />
            ) : (
              <ProfilePane
                peerUserId={peerUserId}
                fallbackName={peer?.name ?? "?"}
                fallbackImage={peer?.image ?? null}
                isAgent={isAgent}
                agentInfo={
                  isAgent && active?.agentInfo
                    ? {
                        name: active.agentInfo.name,
                        avatar: active.agentInfo.avatar,
                        lastActiveAt: active.agentInfo.lastActiveAt,
                      }
                    : null
                }
              />
            )}
          </aside>
        )}

        {/* Profile overlay for < xl screens (toggle from the header). */}
        {activeConversationId && overlayProfile && (
          <div
            className="fixed inset-0 z-50 xl:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={t("profileKicker")}
          >
            <button
              type="button"
              aria-label={t("hideProfile")}
              onClick={() => setOverlayProfile(false)}
              className="bg-foreground/20 absolute inset-0 motion-safe:transition-opacity"
            />
            <aside className="border-border bg-background motion-safe:animate-in motion-safe:slide-in-from-right absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col border-l shadow-lg motion-safe:duration-200">
              {isRoom ? (
                <RoomInfoPane
                  roomName={active?.title ?? "Room"}
                  roomVisibility={active?.roomVisibility ?? null}
                  memberCount={active?.memberCount ?? 0}
                  communityName={active?.communityName ?? null}
                  communityLogoUrl={active?.communityLogoUrl ?? null}
                  communitySlug={active?.communitySlug ?? null}
                  roomSlug={active?.roomSlug ?? null}
                />
              ) : (
                <ProfilePane
                  peerUserId={peerUserId}
                  fallbackName={peer?.name ?? "?"}
                  fallbackImage={peer?.image ?? null}
                  isAgent={isAgent}
                  agentInfo={
                    isAgent && active?.agentInfo
                      ? {
                          name: active.agentInfo.name,
                          avatar: active.agentInfo.avatar,
                          lastActiveAt: active.agentInfo.lastActiveAt,
                        }
                      : null
                  }
                />
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
