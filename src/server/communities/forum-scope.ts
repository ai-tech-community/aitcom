import type { Where } from "payload";

import { HUB_SLUG } from "./hub";

export const HUB_FORUM_PATH = `/communities/${HUB_SLUG}/forum`;

export type CommunityRef = {
  id: string;
  slug: string;
};

function isHubCommunity(community: CommunityRef): boolean {
  return community.slug === HUB_SLUG;
}

/** The Hub also includes platform content without a community. */
export function communityContentMatches(
  communityId: string | null | undefined,
  community: CommunityRef,
): boolean {
  if (isHubCommunity(community)) {
    return communityId == null || communityId === community.id;
  }
  return communityId === community.id;
}

/** Payload scope shared by community events and forum threads. */
export function communityContentWhere(community: CommunityRef): Where {
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

/** Hub forum includes unscoped legacy threads and Hub-owned ones. */
export function forumThreadMatchesCommunity(
  threadCommunityId: string | null | undefined,
  community: CommunityRef,
): boolean {
  return communityContentMatches(threadCommunityId, community);
}

export function forumThreadCommunityWhere(community: CommunityRef): Where {
  return communityContentWhere(community);
}

/**
 * Payload `where` for the threads of several community forums at once. The
 * Hub's unscoped threads come along only when the Hub is in the set.
 */
export function forumThreadCommunitiesWhere(
  communities: readonly CommunityRef[],
): Where {
  const inSet: Where = {
    communityId: { in: communities.map((community) => community.id) },
  };
  if (!communities.some(isHubCommunity)) return inSet;
  return { or: [inSet, { communityId: { exists: false } }] };
}

/**
 * Which of `communities` a thread's forum belongs to: its own community, or
 * the Hub for an unscoped thread. Null when none of them is its forum.
 */
export function forumThreadCommunityOf<C extends CommunityRef>(
  threadCommunityId: string | null | undefined,
  communities: readonly C[],
): C | null {
  return (
    communities.find((community) =>
      forumThreadMatchesCommunity(threadCommunityId, community),
    ) ?? null
  );
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
