import { sql } from "@payloadcms/db-postgres";

import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * A thread's `replyCount` is a cache of its live (not soft-deleted)
 * `forum-replies` rows. Recount it from those rows and store the result,
 * instead of adding or subtracting one from the value read earlier: two
 * replies at once cannot overwrite each other's +1, and a count left behind
 * by an earlier failed write is corrected by the next change. Call it after
 * every write to a thread's replies; pass `touch` when the write is new
 * activity (a reply), so the thread also moves up by `lastActivityAt`.
 */
export async function syncForumThreadCounters(
  payload: Payload,
  threadId: number,
  { touch = false }: { touch?: boolean } = {},
): Promise<{ replyCount: number }> {
  const { totalDocs: replyCount } = await payload.count({
    collection: "forum-replies",
    where: {
      and: [
        { thread: { equals: threadId } },
        { isDeleted: { not_equals: true } },
      ],
    },
  });
  // Only these columns: re-saving the whole thread through Payload would
  // write back fields read a moment ago over a concurrent edit.
  await payload.db.drizzle.execute(
    touch
      ? sql`
          UPDATE "forum_threads"
            SET "reply_count" = ${replyCount}, "last_activity_at" = now()
            WHERE "id" = ${threadId}
        `
      : sql`
          UPDATE "forum_threads"
            SET "reply_count" = ${replyCount}
            WHERE "id" = ${threadId}
        `,
  );
  return { replyCount };
}
