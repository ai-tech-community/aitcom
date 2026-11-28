"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useMediaQuery } from "@/hooks/use-media-query";
import { messagesHref } from "@/lib/communities/message-return";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChatSignIn, useChatAccess } from "./chat-sign-in";
import { ConnectionStatus } from "@/components/inbox/connection-status";
import {
  conversationUnreadCount,
  useShellUnread,
} from "@/components/shells/shell-unread";
import { api, type RouterOutputs } from "@/trpc/react";
import { useInboxStream } from "@/components/inbox/use-inbox-stream";
import { LIVE_MESSAGES_FALLBACK_MS } from "@/components/inbox/live-refetch";
import { cn } from "@/lib/utils";
import { ConversationList } from "./conversation-list";
import { ConversationView } from "./conversation-view";
import { ProfilePane, RoomInfoPane } from "./profile-pane";
import { NewMessage } from "./new-message";

type MessagesShellProps = {
  activeConversationId?: string;
  redesigned?: boolean;
  fromCommunity?: string;
  unreadOnly?: boolean;
};

export function MessagesShell(props: MessagesShellProps) {
  return props.redesigned ? (
    <SignedInMessages {...props} />
  ) : (
    <MessagesContent {...props} />
  );
}

function SignedInMessages(props: MessagesShellProps) {
  const { user, pending } = useChatAccess();
  if (user) return <MessagesContent {...props} />;
  if (pending)
    return (
      <div aria-busy className="mx-auto max-w-lg space-y-4 px-6 py-20">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-11 w-24" />
      </div>
    );
  return (
    <ChatSignIn
      redirect={messagesHref(
        props.activeConversationId,
        props.fromCommunity,
        props.unreadOnly,
      )}
    />
  );
}

function MessagesContent({
  activeConversationId: requestedConversationId,
  redesigned = false,
  fromCommunity,
  unreadOnly = false,
}: MessagesShellProps) {
  const chat = useTranslations("redesign.chat");
  const t = useTranslations("inbox");
  const router = useRouter();

  // Subscribe to realtime once for the whole page.
  useInboxStream();

  // Docked profile pane (xl+) shows by default. The overlay (< xl) only opens
  // when the user explicitly toggles it on, so it never pops on first load.
  const [dockedProfile, setDockedProfile] = useState(true);
  const [overlayProfile, setOverlayProfile] = useState(false);
  const [composing, setComposing] = useState(false);
  // Mobile: which pane is foregrounded when a conversation is active.
  const [mobileView, setMobileView] = useState<"list" | "conversation">(
    requestedConversationId ? "conversation" : "list",
  );

  useEffect(() => {
    setMobileView(requestedConversationId ? "conversation" : "list");
    setComposing(false);
    setOverlayProfile(false);
  }, [requestedConversationId]);

  // The header toggle flips the docked pane (xl+) and the overlay (< xl) together;
  // CSS visibility classes ensure only the size-appropriate one is rendered.
  const isWide = useMediaQuery("(min-width: 80rem)", true);
  const profileTrigger = useRef<HTMLElement | null>(null);

  function toggleProfile() {
    if (redesigned) {
      if (isWide) setDockedProfile((visible) => !visible);
      else {
        profileTrigger.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setOverlayProfile(true);
      }
      return;
    }
    setDockedProfile((v) => !v);
    setOverlayProfile((v) => !v);
  }

  // Resolve the active conversation's peer for the header + profile pane.
  const conversationsQuery = api.inbox.listConversations.useQuery(
    { limit: 30, cursor: null },
    { refetchInterval: LIVE_MESSAGES_FALLBACK_MS },
  );

  const isDesktop = useMediaQuery("(min-width: 64rem)", false);
  const { readThrough } = useShellUnread();
  const automaticId = useDefaultConversation(
    redesigned && isDesktop && !requestedConversationId && !unreadOnly,
    conversationsQuery.data?.conversations,
    readThrough,
  );
  const activeConversationId = requestedConversationId ?? automaticId;

  const listed = useMemo(
    () =>
      conversationsQuery.data?.conversations.find(
        (c) => c.id === activeConversationId,
      ) ?? null,
    [conversationsQuery.data, activeConversationId],
  );

  // A conversation older than the list's first page is looked up on its own,
  // once the list has loaded without it. A link to a conversation that does
  // not exist (or is not the viewer's) will not appear on a retry, so
  // NOT_FOUND is final; any other failure keeps React Query's 3 retries.
  const lookUpActive =
    activeConversationId !== undefined &&
    conversationsQuery.data !== undefined &&
    listed === null;
  const activeQuery = api.inbox.getConversation.useQuery(
    { conversationId: activeConversationId ?? "" },
    {
      enabled: lookUpActive,
      retry: (failureCount, error) =>
        error.data?.code !== "NOT_FOUND" && failureCount < 3,
    },
  );

  const active = listed ?? (lookUpActive ? (activeQuery.data ?? null) : null);

  const isAgent = active?.type === "agent";
  const isRoom = active?.isRoom ?? false;
  const peer = active
    ? isRoom
      ? {
          name: active.title ?? (redesigned ? chat("roomType") : "Room"),
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
            name:
              active.participants[0]?.displayName ??
              (redesigned ? chat("member") : "Unknown"),
            image:
              (redesigned ? active.participants[0]?.avatarUrl : undefined) ??
              active.participants[0]?.image ??
              null,
            isAgent: false,
          }
    : null;

  // Rooms have no single peer profile to show in the docked profile pane.
  const peerUserId =
    active && !isAgent && !isRoom
      ? (active.participants[0]?.userId ?? null)
      : null;

  const roomHref =
    active?.communitySlug && active.roomSlug
      ? `/communities/${active.communitySlug}/spaces/${active.roomSlug}`
      : undefined;
  const roomAuthors =
    roomHref && active?.communitySlug
      ? { slug: active.communitySlug, previews: [] }
      : undefined;
  const profile = isRoom ? (
    <RoomInfoPane
      roomName={active?.title ?? (redesigned ? chat("roomType") : "Room")}
      roomVisibility={active?.roomVisibility ?? null}
      memberCount={active?.memberCount ?? 0}
      communityName={active?.communityName ?? null}
      communityLogoUrl={active?.communityLogoUrl ?? null}
      communitySlug={active?.communitySlug ?? null}
      roomSlug={active?.roomSlug ?? null}
      redesigned={redesigned}
    />
  ) : (
    <ProfilePane
      peerUserId={peerUserId}
      fallbackName={peer?.name ?? "?"}
      fallbackImage={peer?.image ?? null}
      isAgent={isAgent}
      agentInfo={isAgent ? active?.agentInfo : null}
      redesigned={redesigned}
    />
  );

  return (
    <div
      data-messages-shell=""
      className={cn(
        "bg-background h-[calc(100dvh-var(--shell-top-offset)-var(--shell-bottom-offset))]",
        redesigned
          ? "flex min-h-80 flex-col lg:h-[calc(100dvh-var(--shell-top-offset)-var(--shell-header-border))]"
          : "border-border mx-auto max-w-7xl border-x",
      )}
    >
      {redesigned ? <ConnectionStatus /> : null}
      <div className={cn("flex h-full min-h-0", redesigned && "flex-1")}>
        {/* ── Left: conversation list / new-message ───────────────────── */}
        <aside
          aria-label={t("messagesKicker")}
          className={cn(
            "border-border bg-background flex w-full flex-col border-r lg:w-80 lg:shrink-0",
            redesigned && "bg-muted/20 max-lg:border-r-0",
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
              redesigned={redesigned}
              fromCommunity={fromCommunity}
            />
          ) : (
            <ConversationList
              activeConversationId={activeConversationId}
              onNewMessage={() => setComposing(true)}
              onSelect={() => setMobileView("conversation")}
              redesigned={redesigned}
              fromCommunity={fromCommunity}
              unreadOnly={unreadOnly}
              onUnreadChange={
                redesigned
                  ? (unread) => {
                      router.replace(
                        messagesHref(
                          requestedConversationId,
                          fromCommunity,
                          unread,
                        ),
                        { scroll: false },
                      );
                    }
                  : undefined
              }
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
              redesigned={redesigned}
              profileExpanded={
                redesigned
                  ? isWide
                    ? dockedProfile
                    : overlayProfile
                  : undefined
              }
              showConnectionStatus={false}
              roomHref={roomHref}
              roomAuthors={roomAuthors}
            />
          ) : redesigned && isDesktop && conversationsQuery.isLoading ? (
            <div aria-busy className="space-y-4 p-6">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-10 w-1/2" />
            </div>
          ) : (
            <div
              className={cn(
                "flex h-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center",
                redesigned && "items-start justify-start px-10 pt-20 text-left",
              )}
            >
              <MessageSquareIcon className="text-muted-foreground h-9 w-9" />
              <p
                className={cn(
                  "text-foreground text-sm font-medium",
                  redesigned && "text-xl font-semibold tracking-tight",
                )}
              >
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
              redesigned && "bg-muted/20 w-52",
              // Docked only at xl+; under xl the profile is an overlay (below).
              "hidden xl:flex",
            )}
          >
            {profile}
          </aside>
        )}

        {/* Profile overlay for < xl screens (toggle from the header). */}
        {redesigned && activeConversationId ? (
          <Sheet
            open={overlayProfile && !isWide}
            onOpenChange={setOverlayProfile}
          >
            <SheetContent
              showCloseButton={false}
              aria-describedby={undefined}
              className="w-[min(90vw,22rem)] gap-0 motion-reduce:animate-none"
              onCloseAutoFocus={(event) => {
                if (!profileTrigger.current?.isConnected) return;
                event.preventDefault();
                profileTrigger.current.focus();
              }}
            >
              <SheetHeader className="flex-row items-center justify-between gap-2 border-b px-5 py-2">
                <SheetTitle>{chat("details")}</SheetTitle>
                <SheetClose asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={chat("closeDetails")}
                  >
                    <X aria-hidden />
                  </Button>
                </SheetClose>
              </SheetHeader>
              <div className="min-h-0 flex-1 [&_[data-profile-header]]:hidden">
                {profile}
              </div>
            </SheetContent>
          </Sheet>
        ) : activeConversationId && overlayProfile ? (
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
              {profile}
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ConversationSummary =
  RouterOutputs["inbox"]["listConversations"]["conversations"][number];

function mostRecentConversation(conversations: readonly ConversationSummary[]) {
  // Real message activity wins over an empty conversation created more recently.
  return conversations.reduce<ConversationSummary | undefined>(
    (latest, current) => {
      if (!latest) return current;
      if (Boolean(current.lastMessage) !== Boolean(latest.lastMessage)) {
        return current.lastMessage ? current : latest;
      }
      const timestamp = (conversation: ConversationSummary) =>
        new Date(
          conversation.lastMessage?.createdAt ?? conversation.updatedAt,
        ).getTime();
      return timestamp(current) > timestamp(latest) ? current : latest;
    },
    undefined,
  );
}

function useDefaultConversation(
  enabled: boolean,
  conversations: readonly ConversationSummary[] | undefined,
  readThrough: ReadonlyMap<string, number>,
) {
  const [defaultId, setDefaultId] = useState<string>();
  const selection =
    defaultId && conversations?.some(({ id }) => id === defaultId)
      ? defaultId
      : mostRecentConversation(
          conversations?.filter(
            (row) => conversationUnreadCount(row, readThrough) === 0,
          ) ?? [],
        )?.id;
  useEffect(() => {
    if (enabled) setDefaultId(selection);
  }, [enabled, selection]);
  return enabled ? selection : undefined;
}
