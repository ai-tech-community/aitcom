"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { CopyIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChatAvatar } from "./chat-avatar";
import { Button } from "@/components/ui/button";
import { MessageBody } from "@/components/inbox/message-body";
import { cn } from "@/lib/utils";
import type { HubAuthUser } from "@/server/better-auth/hub-session";
import { api, type RouterOutputs } from "@/trpc/react";

type ChatMessage = RouterOutputs["inbox"]["getMessages"]["messages"][number];
type RoomAuthor = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
};
export type RoomAuthors = { slug: string; previews: readonly RoomAuthor[] };
type MessageAuthor = {
  name: string;
  image: string | null;
  avatarName?: string;
};

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

const MESSAGE_GROUP_GAP = 5 * 60 * 1000;

export function groupMessages<
  T extends Pick<ChatMessage, "senderId" | "senderType" | "createdAt"> & {
    id?: string;
  },
>(messages: readonly T[], firstUnreadId?: string) {
  const groups: T[][] = [];
  for (const message of messages) {
    const group = groups.at(-1);
    const preceding = group?.at(-1);
    if (
      group &&
      preceding &&
      (!firstUnreadId || message.id !== firstUnreadId) &&
      preceding.senderId === message.senderId &&
      preceding.senderType === message.senderType &&
      toDateKey(preceding.createdAt) === toDateKey(message.createdAt) &&
      message.createdAt.getTime() - preceding.createdAt.getTime() <
        MESSAGE_GROUP_GAP
    ) {
      group.push(message);
    } else {
      groups.push([message]);
    }
  }
  return groups;
}

export function RoomTranscript({
  messages,
  conversationId,
  authors,
  viewer,
  viewerAvatarUrl,
  firstUnreadId,
}: {
  messages: readonly ChatMessage[];
  conversationId: string;
  authors: RoomAuthors;
  viewer: HubAuthUser | null;
  viewerAvatarUrl?: string | null;
  firstUnreadId?: string;
}) {
  const t = useTranslations("redesign.chat");
  const byUser = new Map(
    authors.previews.map((author) => [author.userId, author]),
  );
  const humanSenders = [
    ...new Set(
      messages.flatMap(({ senderId, senderType }) =>
        senderType === "human" && senderId !== viewer?.id ? [senderId] : [],
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
      avatarUrl: row.avatarUrl ?? row.image,
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

  return (
    <ChatTranscript
      messages={messages}
      conversationId={conversationId}
      viewerId={viewer?.id}
      firstUnreadId={firstUnreadId}
      resolveAuthor={(message) => {
        // For agent rows, senderId identifies the owner, never the speaking agent.
        if (message.senderType !== "human") return null;
        if (message.senderId === viewer?.id) {
          const name = viewer.name?.trim();
          return {
            name: name?.length ? name : t("you"),
            image: viewerAvatarUrl ?? viewer.image ?? null,
          };
        }
        const author = byUser.get(message.senderId);
        return author?.displayName
          ? { name: author.displayName, image: author.avatarUrl }
          : null;
      }}
    />
  );
}

export function ChatTranscript({
  messages,
  conversationId,
  viewerId,
  resolveAuthor,
  firstUnreadId,
}: {
  messages: readonly ChatMessage[];
  conversationId: string;
  viewerId?: string;
  firstUnreadId?: string;
  resolveAuthor: (message: ChatMessage) => MessageAuthor | null;
}) {
  const locale = useLocale();
  const t = useTranslations("redesign.chat");
  const inbox = useTranslations("inbox");
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const timeFormat = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    ...(locale === "en" ? { hourCycle: "h12" } : {}),
  });
  const groups = groupMessages(messages, firstUnreadId);
  const [touchActions, setTouchActions] = useState<string | null>(null);

  async function copyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyError"));
    }
  }

  const days = new Map<string, typeof groups>();
  for (const group of groups) {
    const day = toDateKey(group[0]!.createdAt);
    const current = days.get(day);
    if (current) current.push(group);
    else days.set(day, [group]);
  }

  return [...days].map(([day, dayGroups]) => {
    const date = dayGroups[0]![0]!.createdAt;
    const label =
      day === toDateKey(today)
        ? inbox("today")
        : day === toDateKey(yesterday)
          ? inbox("yesterday")
          : date.toLocaleDateString(locale, {
              month: "long",
              day: "numeric",
              year:
                date.getFullYear() === today.getFullYear()
                  ? undefined
                  : "numeric",
            });
    return (
      <div key={day} className="flex flex-col gap-2" data-chat-day="">
        <div
          className="border-border bg-background text-muted-foreground sticky top-0 z-20 border-b py-2 font-mono text-xs"
          data-chat-day-divider=""
        >
          {label}
        </div>
        {dayGroups.map(renderGroup)}
      </div>
    );
  });

  function renderGroup(group: ChatMessage[]) {
    const first = group[0]!;
    const date = first.createdAt;
    const startsUnread = first.id === firstUnreadId;
    const isAgent = first.senderType === "agent";
    const author = resolveAuthor(first);

    return (
      <div
        key={first.id}
        data-room-message=""
        data-chat-unread={startsUnread ? "" : undefined}
      >
        {startsUnread ? (
          <div className="border-foreground/30 text-foreground mb-3 border-t pt-1.5 text-xs font-semibold">
            {t("newMessages")}
          </div>
        ) : null}
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3">
          <ChatAvatar
            name={author?.avatarName ?? author?.name}
            image={author?.image}
            kind={isAgent ? "agent" : "person"}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span
                dir="auto"
                className="text-sm font-semibold wrap-break-word"
              >
                {author?.name ?? t(isAgent ? "agent" : "member")}
              </span>
              {isAgent && author ? (
                <span className="text-muted-foreground text-xs">
                  {t("agent")}
                </span>
              ) : null}
              <time
                dateTime={date.toISOString()}
                className="text-muted-foreground font-mono text-xs"
              >
                {timeFormat.format(date)}
              </time>
            </div>
            {group.map((message) => (
              <div
                key={message.id}
                className="group/chat-message relative min-w-0"
                onPointerUp={(event) => {
                  if (event.pointerType !== "touch" || !message.content.trim())
                    return;
                  if (
                    event.target instanceof Element &&
                    event.target.closest("a, button, input, [role=button]")
                  )
                    return;
                  setTouchActions((open) =>
                    open === message.id ? null : message.id,
                  );
                }}
              >
                <div
                  dir="auto"
                  className="min-w-0 py-0.5 text-sm leading-relaxed wrap-anywhere"
                >
                  <MessageBody
                    message={message}
                    isUser={
                      message.senderId === viewerId &&
                      message.senderType === "human"
                    }
                    conversationId={conversationId}
                  />
                </div>
                {message.content.trim() ? (
                  <div
                    role="group"
                    aria-label={t("messageActions")}
                    className={cn(
                      "border-border bg-background pointer-events-none absolute top-0 right-0 z-10 flex gap-1 rounded-md border opacity-0 group-focus-within/chat-message:pointer-events-auto group-focus-within/chat-message:opacity-100 group-hover/chat-message:pointer-events-auto group-hover/chat-message:opacity-100",
                      touchActions === message.id &&
                        "pointer-events-auto opacity-100",
                    )}
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-h-11 sm:min-h-8"
                      aria-label={t("copyMessage")}
                      onClick={() => {
                        setTouchActions(null);
                        void copyMessage(message.content);
                      }}
                    >
                      <CopyIcon aria-hidden className="size-3.5" />
                      {t("copy")}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
}

/** Keep the latest message in view on resize, and position the unread marker
 * once when opening a conversation. */
export function TranscriptViewportPosition() {
  const { scrollRef, contentRef, scrollToBottom, stopScroll } =
    useStickToBottomContext();
  const positionedUnread = useRef(false);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;
    let viewportHeight = scroll.clientHeight;
    let atLatest = scroll.scrollHeight - scroll.scrollTop - viewportHeight <= 2;
    function refresh() {
      if (!scroll || !content) return;
      const nextHeight = scroll.clientHeight;
      // A notice can resize the viewport without resizing the transcript.
      // Preserve the reading position when away from the end.
      if (atLatest && nextHeight !== viewportHeight)
        scroll.scrollTop = scroll.scrollHeight;
      viewportHeight = nextHeight;
      atLatest = scroll.scrollHeight - scroll.scrollTop - viewportHeight <= 2;
    }

    const resize = new ResizeObserver(refresh);
    resize.observe(scroll);
    resize.observe(content);
    scroll.addEventListener("scroll", refresh, { passive: true });
    refresh();
    const frame = requestAnimationFrame(() => {
      if (positionedUnread.current || !scroll || !content) return;
      const unread = content.querySelector<HTMLElement>("[data-chat-unread]");
      if (!unread) return;
      positionedUnread.current = true;
      const dayHeading = unread.parentElement?.querySelector<HTMLElement>(
        "[data-chat-day-divider]",
      );
      const offset =
        unread.getBoundingClientRect().top -
        scroll.getBoundingClientRect().top -
        (dayHeading?.offsetHeight ?? 0);
      const target = scroll.scrollTop + offset;
      if (target >= scroll.scrollHeight - scroll.clientHeight - 2) {
        void scrollToBottom("instant");
      } else {
        stopScroll();
        scroll.scrollTop = Math.max(0, target);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      scroll.removeEventListener("scroll", refresh);
    };
  }, [scrollRef, contentRef, scrollToBottom, stopScroll]);

  return null;
}
