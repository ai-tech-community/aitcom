/**
 * Who may still publish an agent's community draft when it is approved.
 *
 * A draft is checked when the agent makes it (the owner must be an active
 * member of the community it lands in) and again here, before the draft is
 * claimed, because membership can end in between (ADR-0050). Checking
 * before the claim means a refused approval leaves the draft pending.
 *
 * - The agent's owner must still be an active member in good standing.
 * - So must the reviewer whose name a thread, post or comment is published
 *   under, when that is someone else.
 * - A reply draft names its thread, not always its community: the
 *   community is read from the thread, so a draft without `communityId`
 *   metadata is checked all the same. A thread with no community is
 *   Hub-wide and open to any signed-in user.
 *
 * Drafts that publish nothing into a community pass unchanged.
 */

import { TRPCError } from "@trpc/server";

import type { db as appDb } from "@/server/db";
import type { getPayloadClient } from "@/server/payload";
import {
  requireActiveMemberBySlug,
  requireActiveMemberOf,
} from "@/server/communities/content-access";
import {
  FORUM_THREAD_DRAFT_TYPE,
  type ForumThreadDraft,
} from "@/server/communities/forum-thread-draft";

type DB = typeof appDb;
type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export type PublishableDraft = {
  type: string;
  ownerId: string;
  targetId: string | null;
  metadata: unknown;
};

/** The publishers to check: the owner, and the reviewer when different. */
function publishersOf(draft: PublishableDraft, reviewerId: string): string[] {
  return [...new Set([draft.ownerId, reviewerId])];
}

/**
 * Throws unless everyone the draft is published as may still write into
 * the community it lands in. `thread` is the parsed thread draft, for a
 * thread draft being approved.
 */
export async function requireDraftPublishable(
  db: DB,
  payload: Payload,
  draft: PublishableDraft,
  input: { reviewerId: string; thread?: ForumThreadDraft },
): Promise<void> {
  if (draft.type === FORUM_THREAD_DRAFT_TYPE) {
    const slug = input.thread?.communitySlug;
    if (!slug) return;
    for (const userId of publishersOf(draft, input.reviewerId)) {
      await requireActiveMemberBySlug(db, slug, userId, {
        notFound: "Community not found",
      });
    }
    return;
  }

  if (draft.type === "thread_reply") {
    const thread = draft.targetId
      ? await payload.findByID({
          collection: "forum-threads",
          id: Number(draft.targetId),
          depth: 0,
          disableErrors: true,
        })
      : null;
    if (!thread) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
    }
    // Never trust that targetId points at a thread in the draft's community.
    const draftCommunityId = (draft.metadata as { communityId?: string } | null)
      ?.communityId;
    if (
      draftCommunityId &&
      thread.communityId &&
      thread.communityId !== draftCommunityId
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Target thread does not belong to this community",
      });
    }
    // The reply is the agent's, on the owner's behalf: the owner counts.
    await requireActiveMemberOf(db, thread.communityId, draft.ownerId, {
      notFound: "Thread not found",
    });
    return;
  }

  if (draft.type === "feed_post") {
    if (!draft.targetId) return;
    for (const userId of publishersOf(draft, input.reviewerId)) {
      await requireActiveMemberOf(db, draft.targetId, userId, {
        notFound: "Community not found",
      });
    }
    return;
  }

  if (draft.type === "feed_comment") {
    const post = draft.targetId
      ? await payload.findByID({
          collection: "feed-posts",
          id: Number(draft.targetId),
          depth: 0,
          disableErrors: true,
        })
      : null;
    if (!post || post.isDeleted) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
    }
    for (const userId of publishersOf(draft, input.reviewerId)) {
      await requireActiveMemberOf(db, post.communityId, userId, {
        notFound: "Post not found",
      });
    }
  }
}
