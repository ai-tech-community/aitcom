import { TRPCError } from "@trpc/server";
import type { Where } from "payload";

import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/** Every community has this topic; it is made the first time topics load. */
export const DEFAULT_TOPIC = "general";

/**
 * The topic a post goes under: the default when none is given, otherwise
 * one of the community's own topics. A post can never be filed under a
 * topic that does not exist in its community.
 */
export async function resolvePostTopic(
  payload: Payload,
  communityId: string,
  slug: string | undefined,
): Promise<string> {
  if (!slug || slug === DEFAULT_TOPIC) return DEFAULT_TOPIC;
  const { totalDocs } = await payload.count({
    collection: "community-topics",
    where: {
      and: [
        { communityId: { equals: communityId } },
        { slug: { equals: slug } },
      ],
    },
  });
  if (totalDocs === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That topic does not exist in this community.",
    });
  }
  return slug;
}

/**
 * What happens to content filed under a topic that is being deleted: feed
 * posts move to the default topic, and gallery items and batches lose their
 * category (spec 2026-11-13, Categories). Call before deleting the topic.
 * A row Payload could not write is logged and thrown, so the caller keeps
 * the topic and the owner can try again; every step is safe to repeat.
 */
export async function releaseDeletedTopic(
  payload: Payload,
  topic: { communityId: string; slug: string },
  log: (message: string, detail: unknown) => void = console.error,
): Promise<void> {
  const where: Where = {
    and: [
      { communityId: { equals: topic.communityId } },
      { topicSlug: { equals: topic.slug } },
    ],
  };
  const results = await Promise.all([
    payload
      .update({
        collection: "feed-posts",
        where,
        data: { topicSlug: DEFAULT_TOPIC },
      })
      .then(({ errors }) => ({ collection: "feed-posts", errors })),
    payload
      .update({ collection: "gallery-items", where, data: { topicSlug: null } })
      .then(({ errors }) => ({ collection: "gallery-items", errors })),
    payload
      .update({
        collection: "gallery-batches",
        where,
        data: { topicSlug: null },
      })
      .then(({ errors }) => ({ collection: "gallery-batches", errors })),
  ]);
  const failed = results.filter((result) => result.errors.length > 0);
  for (const result of failed) {
    log("[topics.remove] moving content off a deleted topic failed", {
      ...result,
      topic,
    });
  }
  if (failed.length > 0) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
}
