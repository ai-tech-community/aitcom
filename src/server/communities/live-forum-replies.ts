import type { Where } from "payload";

import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * Replies a reader may see. `is_deleted` is set by soft-delete; the row
 * stays in the table, so every list has to ask for this explicitly.
 * `reply_count` on the thread is a stored cache of this same set. A delete
 * that does not recount leaves the cache stale, so readers ask again
 * instead of trusting the column.
 */
export function liveForumRepliesWhere(threadId: number): Where {
  return {
    and: [
      { thread: { equals: threadId } },
      { isDeleted: { not_equals: true } },
    ],
  };
}

export async function liveReplyCounts(
  payload: Payload,
  threadIds: readonly number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  await Promise.all(
    threadIds.map(async (threadId) => {
      const { totalDocs } = await payload.count({
        collection: "forum-replies",
        where: liveForumRepliesWhere(threadId),
      });
      counts.set(threadId, totalDocs);
    }),
  );
  return counts;
}
