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
 * The `poll` group a post stores for a poll its author set up, closing
 * `days` after `now`. Refuses a poll that breaks the rules (`pollProblem`).
 */
export function pollFields(choice: PollChoice, now: Date) {
  const problem = pollProblem(choice.options);
  if (problem) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: PROBLEM_MESSAGES[problem],
    });
  }
  return {
    options: choice.options.map((label) => ({ label: label.trim() })),
    closesAt: new Date(
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

/** Whether anyone voted on a post's poll (on Payload's connection). */
export async function pollHasVotes(
  payload: Payload,
  postId: number,
): Promise<boolean> {
  const { rows } = await payload.db.drizzle.execute(payloadSql`
    SELECT 1 FROM "app"."feed_poll_vote" WHERE "post_id" = ${postId} LIMIT 1
  `);
  return rows.length > 0;
}

/** How many members voted on a post's poll. */
export async function countPollVotes(
  database: Database,
  postId: number,
): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(feedPollVotes)
    .where(eq(feedPollVotes.postId, postId));
  return row?.count ?? 0;
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
 * the post.
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
  await database
    .insert(feedPollVotes)
    .values({ postId: post.id, userId: input.userId, optionId: input.optionId })
    .onConflictDoUpdate({
      target: [feedPollVotes.postId, feedPollVotes.userId],
      set: { optionId: input.optionId, updatedAt: now },
    });
}
