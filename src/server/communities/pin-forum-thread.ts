import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import type { db as Database } from "@/server/db";
import { communityMemberships } from "@/server/db/schema";
import type { CommunityRole } from "@/server/communities/role-utils";
import { getPayloadClient } from "@/server/payload";

import {
  pinThreadDenial,
  pinThreadDenialMessage,
} from "@/lib/communities/thread-moderation";

type DB = typeof Database;

/**
 * Set a thread's pin. `allowHubThread` keeps the browser procedure's rule
 * for threads with no community. The MCP tool passes false, so only a
 * community owner, admin, or moderator can pin — the same roles as the
 * pin control on a community thread.
 */
export async function pinForumThread(
  db: DB,
  userId: string,
  input: { threadId: number; isPinned: boolean },
  options: { allowHubThread: boolean },
) {
  const payload = await getPayloadClient();
  const thread = await payload
    .findByID({
      collection: "forum-threads",
      id: input.threadId,
      depth: 0,
      disableErrors: true,
    })
    .catch(() => null);

  if (!thread || thread.isDeleted) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
  }

  let role: CommunityRole | null = null;
  if (thread.communityId) {
    const membership = await db.query.communityMemberships.findFirst({
      where: and(
        eq(communityMemberships.communityId, thread.communityId),
        eq(communityMemberships.userId, userId),
        eq(communityMemberships.status, "active"),
      ),
      columns: { role: true },
    });
    role = membership?.role ?? null;
  }

  const denial = pinThreadDenial({
    communityId: thread.communityId,
    role,
    allowHubThread: options.allowHubThread,
  });
  if (denial) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: pinThreadDenialMessage(denial),
    });
  }

  await payload.update({
    collection: "forum-threads",
    id: input.threadId,
    data: { isPinned: input.isPinned },
  });
  return { ok: true as const, isPinned: input.isPinned };
}
