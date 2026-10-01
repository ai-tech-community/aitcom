import { TRPCError } from "@trpc/server";

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
