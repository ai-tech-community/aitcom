"use client";

import { useEffect, useRef } from "react";
import { api } from "@/trpc/react";
import { LIVE_MESSAGES_FALLBACK_MS } from "@/components/inbox/live-refetch";

export function useRoomUnread(
  slug: string,
  roomIds: readonly string[],
  enabled: boolean,
  readingRoomId?: string,
) {
  const { data, isError, isFetching, hasNextPage, fetchNextPage, refetch } =
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

  const previousRoom = useRef(readingRoomId);
  useEffect(() => {
    // Loading the conversation advances its existing read marker. Read the
    // summaries again after leaving the timeline instead of carrying its badge.
    if (
      enabled &&
      previousRoom.current &&
      previousRoom.current !== readingRoomId
    ) {
      void refetch();
    }
    previousRoom.current = readingRoomId;
  }, [enabled, readingRoomId, refetch]);

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

  if (readingRoomId) counts.delete(readingRoomId);
  return counts;
}
