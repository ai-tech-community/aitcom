import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export type FeedPostCounters = { likeCount: number; commentCount: number };

/**
 * A post's `likeCount` and `commentCount` are caches of its `feed-likes` and
 * live `feed-comments` rows. Recount them from those rows and store the
 * result, instead of adding or subtracting one from the value read earlier:
 * two people liking at once cannot overwrite each other's +1, and a count
 * left behind by an earlier failed write is corrected by the next change.
 * Call it after every write to a post's likes or comments.
 */
export async function syncFeedPostCounters(
  payload: Payload,
  postId: number,
): Promise<FeedPostCounters> {
  const [likes, comments] = await Promise.all([
    payload.count({
      collection: "feed-likes",
      where: { post: { equals: postId } },
    }),
    payload.count({
      collection: "feed-comments",
      where: {
        and: [
          { post: { equals: postId } },
          { isDeleted: { not_equals: true } },
        ],
      },
    }),
  ]);
  const counters = {
    likeCount: likes.totalDocs,
    commentCount: comments.totalDocs,
  };
  await payload.update({
    collection: "feed-posts",
    id: postId,
    data: counters,
  });
  return counters;
}

/**
 * Like the post for `userId`, or remove their like if they already liked it,
 * then resync the post's counters. Callers check that the user may like the
 * post and handle side effects (XP, activity log) from the returned state.
 */
export async function toggleFeedPostLike(
  payload: Payload,
  postId: number,
  userId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const { docs: existing } = await payload.find({
    collection: "feed-likes",
    where: {
      and: [{ post: { equals: postId } }, { userId: { equals: userId } }],
    },
    limit: 1,
    depth: 0,
  });

  const liked = existing.length === 0;
  if (liked) {
    await payload.create({
      collection: "feed-likes",
      data: { post: postId, userId },
    });
  } else {
    await payload.delete({ collection: "feed-likes", id: existing[0]!.id });
  }

  const { likeCount } = await syncFeedPostCounters(payload, postId);
  return { liked, likeCount };
}
