"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useInitialAuthUser } from "@/components/auth/session-provider";
import { LIVE_MESSAGES_FALLBACK_MS } from "@/components/inbox/live-refetch";
import { authClient } from "@/server/better-auth/client";
import type { ConversationSummary } from "@/server/inbox/conversation-summaries";
import { api } from "@/trpc/react";

type UnreadRow = Pick<
  ConversationSummary,
  "id" | "isRoom" | "unreadCount" | "communitySlug" | "spaceId" | "lastMessage"
>;

export function summarizeShellUnread(
  rows: readonly UnreadRow[],
  readThrough: ReadonlyMap<string, number>,
) {
  const rooms = new Map<string, number>();
  const communities = new Set<string>();
  let messages = 0;
  let accountedUnread = 0;
  const seen = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    accountedUnread += row.unreadCount;
    const latest = row.lastMessage?.createdAt;
    // Keep the visible marker clear while the server read write settles.
    const read =
      latest &&
      new Date(latest).getTime() <= (readThrough.get(row.id) ?? -Infinity);
    if (!row.unreadCount || read) continue;
    if (row.isRoom) {
      if (row.spaceId) rooms.set(row.spaceId, row.unreadCount);
      if (row.communitySlug) communities.add(row.communitySlug);
    } else {
      messages += row.unreadCount;
    }
  }

  return { rooms, communities, messages, accountedUnread };
}

const emptyCounts = summarizeShellUnread([], new Map());

export function resolveMessageBadge(
  counts: ReturnType<typeof summarizeShellUnread>,
  total: number | undefined,
  morePages: boolean,
  completeFirstPage = false,
) {
  if (completeFirstPage)
    return { count: counts.messages, includesRooms: false };

  const missingUnread = total !== undefined && total > counts.accountedUnread;
  if (missingUnread) {
    // The existing cursor can skip tied rows or rows behind pinned items.
    // Preserve the authoritative inbox total when the split cannot be verified.
    return morePages
      ? { count: 0, includesRooms: false }
      : { count: total, includesRooms: true };
  }
  return {
    count: total === undefined && morePages ? 0 : counts.messages,
    includesRooms: false,
  };
}
const ShellUnreadContext = createContext({
  ...emptyCounts,
  messagesIncludeRooms: false,
  markRead: undefined as
    | ((conversationId: string, through: number) => void)
    | undefined,
});

export function useShellUnread() {
  return useContext(ShellUnreadContext);
}

export function ShellUnreadProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const initialUser = useInitialAuthUser();
  const { data: session } = authClient.useSession();
  const user = session?.user ?? initialUser;
  // A change of account gets a fresh set of transient read markers.
  return (
    <UnreadSnapshot viewerId={user?.id} enabled={active && !!user}>
      {children}
    </UnreadSnapshot>
  );
}

function UnreadSnapshot({
  enabled,
  viewerId,
  children,
}: {
  enabled: boolean;
  viewerId?: string;
  children: ReactNode;
}) {
  const [read, setRead] = useState<{
    viewerId?: string;
    through: ReadonlyMap<string, number>;
  }>({ through: new Map() });
  const utils = api.useUtils();
  const { data, isError, isFetching, hasNextPage, fetchNextPage } =
    api.inbox.listConversations.useInfiniteQuery(
      { limit: 50 },
      {
        initialCursor: null,
        enabled,
        refetchInterval: (query) =>
          (query.state.data?.pages.length ?? 0) > 1
            ? 60_000
            : LIVE_MESSAGES_FALLBACK_MS,
        getNextPageParam: (last, _pages, _cursor, cursors) => {
          const next = last.nextCursor;
          return next && !cursors.includes(next) ? next : undefined;
        },
      },
    );

  // Without a cursor on the first page, the server returned the full list.
  // Ignore the independent aggregate here to avoid races with a room read.
  const completeFirstPage =
    data?.pages.length === 1 && !data.pages[0]?.nextCursor;
  const { data: totalUnread } = api.inbox.totalUnreadCount.useQuery(undefined, {
    enabled: enabled && !completeFirstPage,
    refetchInterval: LIVE_MESSAGES_FALLBACK_MS,
  });
  const counts = useMemo(() => {
    if (!enabled || !data) return emptyCounts;
    return summarizeShellUnread(
      data.pages.flatMap((page) => page.conversations),
      read.viewerId === viewerId ? read.through : new Map(),
    );
  }, [enabled, data, read, viewerId]);
  const total = enabled && !completeFirstPage ? totalUnread?.count : undefined;
  const morePages = !isError && hasNextPage;
  const needsUnreadRows = total !== undefined && total > counts.accountedUnread;

  useEffect(() => {
    if (enabled && needsUnreadRows && morePages && !isFetching)
      void fetchNextPage();
  }, [enabled, needsUnreadRows, morePages, isFetching, fetchNextPage]);

  const markRead = useCallback(
    (id: string, through: number) => {
      setRead((previous) => {
        const markers =
          previous.viewerId === viewerId
            ? previous.through
            : new Map<string, number>();
        if ((markers.get(id) ?? -Infinity) >= through) return previous;
        return { viewerId, through: new Map(markers).set(id, through) };
      });
      void utils.inbox.listConversations.invalidate();
      void utils.inbox.totalUnreadCount.invalidate();
    },
    [utils, viewerId],
  );

  const badge = resolveMessageBadge(
    counts,
    total,
    morePages || (enabled && isFetching && !data),
    completeFirstPage,
  );

  return (
    <ShellUnreadContext.Provider
      value={{
        ...counts,
        messages: badge.count,
        messagesIncludeRooms: badge.includesRooms,
        markRead: enabled ? markRead : undefined,
      }}
    >
      {children}
    </ShellUnreadContext.Provider>
  );
}
