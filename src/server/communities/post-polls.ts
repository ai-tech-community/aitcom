import { TRPCError } from "@trpc/server";
import { sql as payloadSql } from "@payloadcms/db-postgres";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import { feedPollVotes } from "@/server/db/schema";
import type { getPayloadClient } from "@/server/payload";
import type { FeedPost } from "@/payload-types";
import {
  pollProblem,
  type FeedPollView,
  type PollChoice,
} from "@/lib/poll-rules";

type Database = typeof Db;
type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/** A post with no poll: the `poll` group cleared (a fresh list each time). */
export function noPoll(): NonNullable<FeedPost["poll"]> {
  return { options: [], closesAt: null };
}

const PROBLEM_MESSAGES = {
  tooFew: "A poll needs at least two answers.",
  tooMany: "A poll has at most four answers.",
  empty: "Fill in every answer, or remove the empty one.",
  tooLong: "An answer is too long.",
  duplicate: "Two answers are the same.",
} as const;

/**
 * The `poll` group a post stores for a poll its author set up: open for
 * `days` from `now`, or, with `days` null, until `keepClosesAt` (the poll
 * being changed keeps its end). Refuses a poll that breaks the rules
 * (`pollProblem`).
 */
export function pollFields(
  choice: PollChoice,
  now: Date,
  keepClosesAt?: string | null,
) {
  const problem = pollProblem(choice.options);
  if (problem) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: PROBLEM_MESSAGES[problem],
    });
  }
  if (choice.days === null && !keepClosesAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose how long the poll stays open.",
    });
  }
  return {
    options: choice.options.map((label) => ({ label: label.trim() })),
    closesAt:
      choice.days === null
        ? keepClosesAt!
        : new Date(
            now.getTime() + choice.days * 24 * 60 * 60 * 1000,
          ).toISOString(),
  };
}

/** The answer ids of a post's poll, in order (none without a poll). */
export function pollOptionIds(post: Pick<FeedPost, "poll">): string[] {
  return (post.poll?.options ?? []).flatMap((option) =>
    option.id ? [option.id] : [],
  );
}

/** Whether a post carries a poll. */
export function hasPoll(post: Pick<FeedPost, "poll">): boolean {
  return pollOptionIds(post).length > 0;
}

/**
 * Removes the votes for answers a post no longer has: all of them when its
 * poll is taken off or replaced. Run after the post is written, on the
 * connection that wrote it.
 */
export async function removeStaleVotes(
  payload: Payload,
  postId: number,
  keptOptionIds: readonly string[],
): Promise<void> {
  const kept =
    keptOptionIds.length > 0
      ? payloadSql`AND "option_id" NOT IN (${payloadSql.join(
          keptOptionIds.map((id) => payloadSql`${id}`),
          payloadSql`, `,
        )})`
      : payloadSql``;
  await payload.db.drizzle.execute(payloadSql`
    DELETE FROM "app"."feed_poll_vote" WHERE "post_id" = ${postId} ${kept}
  `);
}

/**
 * The polls of a set of posts as the feed shows them: each answer with its
 * votes, and the viewer's own answer, in two queries. Who voted for what
 * is never shown; only counts.
 */
export async function loadPollViews(
  database: Database,
  posts: readonly Pick<FeedPost, "id" | "poll">[],
  viewerId: string | null | undefined,
  now: Date = new Date(),
): Promise<(post: Pick<FeedPost, "id" | "poll">) => FeedPollView | null> {
  const ids = posts.filter(hasPoll).map((post) => post.id);
  const counts = new Map<string, number>();
  const mine = new Map<number, string>();
  if (ids.length > 0) {
    const [rows, own] = await Promise.all([
      database
        .select({
          postId: feedPollVotes.postId,
          optionId: feedPollVotes.optionId,
          votes: sql<number>`count(*)::int`,
        })
        .from(feedPollVotes)
        .where(inArray(feedPollVotes.postId, ids))
        .groupBy(feedPollVotes.postId, feedPollVotes.optionId),
      viewerId
        ? database
            .select({
              postId: feedPollVotes.postId,
              optionId: feedPollVotes.optionId,
            })
            .from(feedPollVotes)
            .where(
              and(
                inArray(feedPollVotes.postId, ids),
                eq(feedPollVotes.userId, viewerId),
              ),
            )
        : Promise.resolve([]),
    ]);
    for (const row of rows) {
      counts.set(`${row.postId}:${row.optionId}`, row.votes);
    }
    for (const row of own) mine.set(row.postId, row.optionId);
  }
  return (post) => {
    if (!hasPoll(post)) return null;
    const options = (post.poll?.options ?? []).flatMap((option) =>
      option.id
        ? [
            {
              id: option.id,
              label: option.label,
              votes: counts.get(`${post.id}:${option.id}`) ?? 0,
            },
          ]
        : [],
    );
    const closesAt = post.poll?.closesAt ?? now.toISOString();
    const myVote = mine.get(post.id) ?? null;
    return {
      options,
      // Only votes for answers the post still has count.
      totalVotes: options.reduce((sum, option) => sum + option.votes, 0),
      closesAt,
      closed: new Date(closesAt).getTime() <= now.getTime(),
      myVote: options.some((option) => option.id === myVote) ? myVote : null,
    };
  };
}

/**
 * Casts, changes (`optionId`) or takes back (null) a member's vote on a
 * post's poll while it is open. The caller has checked the member may see
 * the post. A vote is stored only if, at that moment, the answer is still
 * one of the post's and the poll is open, in one statement: an author
 * changing the answers at the same time never leaves a vote for an answer
 * the post no longer has.
 */
export async function castPollVote(
  database: Database,
  post: Pick<FeedPost, "id" | "poll">,
  input: { userId: string; optionId: string | null; now?: Date },
): Promise<void> {
  if (!hasPoll(post)) throw new TRPCError({ code: "NOT_FOUND" });
  const closesAt = post.poll?.closesAt;
  const now = input.now ?? new Date();
  if (!closesAt || new Date(closesAt).getTime() <= now.getTime()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This poll has closed.",
    });
  }
  if (input.optionId === null) {
    await database
      .delete(feedPollVotes)
      .where(
        and(
          eq(feedPollVotes.postId, post.id),
          eq(feedPollVotes.userId, input.userId),
        ),
      );
    return;
  }
  if (!pollOptionIds(post).includes(input.optionId)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That answer is not in this poll.",
    });
  }
  const { rows } = await database.execute(sql`
    INSERT INTO "app"."feed_poll_vote" ("id", "post_id", "user_id", "option_id")
    SELECT ${crypto.randomUUID()}, ${post.id}, ${input.userId}, ${input.optionId}
    WHERE EXISTS (
      SELECT 1 FROM "feed_posts_poll_options" o
      JOIN "feed_posts" p ON p."id" = o."_parent_id"
      WHERE o."id" = ${input.optionId}
        AND p."id" = ${post.id}
        AND p."poll_closes_at" > now()
        AND p."is_deleted" IS DISTINCT FROM true
    )
    ON CONFLICT ("post_id", "user_id")
      DO UPDATE SET "option_id" = EXCLUDED."option_id", "updated_at" = now()
    RETURNING "id"
  `);
  if (rows.length === 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This poll just changed. Reload to see it, then vote again.",
    });
  }
}
