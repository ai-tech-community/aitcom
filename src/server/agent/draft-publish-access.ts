/**
 * Who may still publish an agent's community draft when it is approved.
 *
 * A draft is checked when the agent makes it and again here, before the
 * draft is claimed, because things change in between (ADR-0050): a
 * membership ends, the feed policy tightens, a thread is locked. Each
 * draft type runs the very function the direct write path runs, so an
 * approval can never publish what a member could not post themselves.
 * Checking before the claim means a refused approval leaves the draft
 * pending.
 *
 * - thread: `requireThreadAuthor` (member, rules), for the owner and for
 *   the reviewer it is published under.
 * - reply: `requireReplyAuthor` (member, rules, not locked) for the owner;
 *   the community is read from the thread, so a draft without
 *   `communityId` metadata is checked all the same.
 * - feed post: `requireFeedPoster` (member, feed policy) for the owner and
 *   the reviewer it is published under.
 * - feed comment: `requireViewablePost` with membership, as
 *   `feed.addComment`, for the owner and the reviewer.
 *
 * Drafts that publish nothing into a community pass unchanged.
 */

import { TRPCError } from "@trpc/server";

import type { db as appDb } from "@/server/db";
import type { getPayloadClient } from "@/server/payload";
import {
  requireFeedPoster,
  requireViewablePost,
} from "@/server/communities/feed-posts";
import {
  FORUM_THREAD_DRAFT_TYPE,
  type ForumThreadDraft,
} from "@/server/communities/forum-thread-draft";
import {
  requireReplyAuthor,
  requireThreadAuthor,
} from "@/server/communities/forum-write-access";

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
 * Throws unless everyone the draft is published as may still write it,
 * by the direct path's own rules. `thread` is the parsed thread draft, for
 * a thread draft being approved.
 */
export async function requireDraftPublishable(
  db: DB,
  payload: Payload,
  draft: PublishableDraft,
  input: { reviewerId: string; thread?: ForumThreadDraft },
): Promise<void> {
  if (draft.type === FORUM_THREAD_DRAFT_TYPE) {
    for (const userId of publishersOf(draft, input.reviewerId)) {
      await requireThreadAuthor(db, input.thread?.communitySlug, userId);
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
    await requireReplyAuthor(db, thread, draft.ownerId);
    return;
  }

  if (draft.type === "feed_post") {
    if (!draft.targetId) return;
    for (const userId of publishersOf(draft, input.reviewerId)) {
      await requireFeedPoster(db, { id: draft.targetId }, userId);
    }
    return;
  }

  if (draft.type === "feed_comment") {
    if (!draft.targetId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
    }
    for (const userId of publishersOf(draft, input.reviewerId)) {
      await requireViewablePost(db, payload, Number(draft.targetId), userId, {
        requireMembership: true,
      });
    }
  }
}
