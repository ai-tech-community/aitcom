import type { Where } from "payload";

import { HUB_SLUG } from "./hub";

export const HUB_FORUM_PATH = `/communities/${HUB_SLUG}/forum`;

type CommunityRef = {
  id: string;
  slug: string;
};

function isHubCommunity(community: CommunityRef): boolean {
  return community.slug === HUB_SLUG;
}

/** Hub forum includes unscoped (pre-multitenancy) threads and Hub-owned ones. */
export function forumThreadMatchesCommunity(
  threadCommunityId: string | null | undefined,
  community: CommunityRef,
): boolean {
  if (isHubCommunity(community)) {
    return threadCommunityId == null || threadCommunityId === community.id;
  }
  return threadCommunityId === community.id;
}

/** Payload `where` for listing threads on a community forum. */
export function forumThreadCommunityWhere(community: CommunityRef): Where {
  if (isHubCommunity(community)) {
    return {
      or: [
        { communityId: { equals: community.id } },
        { communityId: { exists: false } },
      ],
    };
  }
  return { communityId: { equals: community.id } };
}

export function forumThreadSitemapPath(
  thread: { slug?: string | null; communityId?: string | null },
  communitySlugById: ReadonlyMap<string, string> = new Map(),
): string | null {
  if (!thread.slug) return null;
  const communitySlug = thread.communityId
    ? (communitySlugById.get(thread.communityId) ?? HUB_SLUG)
    : HUB_SLUG;
  return `/communities/${communitySlug}/forum/${thread.slug}`;
}
