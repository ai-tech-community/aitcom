"use client";

import { useEffect } from "react";
import { api } from "@/trpc/react";
import { LIVE_MESSAGES_FALLBACK_MS } from "@/components/inbox/live-refetch";

export function useRoomUnread(
  slug: string,
  roomIds: readonly string[],
  enabled: boolean,
) {
  const { data, isError, isFetching, hasNextPage, fetchNextPage } =
    api.inbox.listConversations.useInfiniteQuery(
      { limit: 50 },
      {
        initialCursor: null,
        enabled: enabled && roomIds.length > 0,
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

  const counts = new Map<string, number>();
  if (enabled && !isError) {
    const visible = new Set(roomIds);
    for (const page of data?.pages ?? []) {
      for (const row of page.conversations) {
        if (
          row.isRoom &&
          row.communitySlug === slug &&
          row.spaceId &&
          visible.has(row.spaceId)
        ) {
          counts.set(row.spaceId, row.unreadCount);
        }
      }
    }
  }
  const hasMissingRooms = counts.size < roomIds.length;
  useEffect(() => {
    if (enabled && hasMissingRooms && hasNextPage && !isFetching && !isError) {
      void fetchNextPage();
    }
  }, [
    enabled,
    hasMissingRooms,
    hasNextPage,
    isFetching,
    isError,
    fetchNextPage,
  ]);

  return counts;
}
