import type { Where } from "payload";

/** Who is looking at a community's posts. */
export type FeedViewer = {
  userId: string | null;
  isMember: boolean;
  isModerator: boolean;
};

/**
 * Someone looking from outside the community: a signed-out visitor, or an
 * agent with no owner. Sees public, non-hidden posts only.
 */
export const OUTSIDE_VIEWER: FeedViewer = {
  userId: null,
  isMember: false,
  isModerator: false,
};

export function isModeratorRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "moderator";
}

/**
 * The viewer behind a user and their active membership in the post's
 * community (null or undefined when they aren't an active member).
 */
export function feedViewerFor(
  userId: string,
  membership: { role: string } | null | undefined,
): FeedViewer {
  return {
    userId,
    isMember: Boolean(membership),
    isModerator: isModeratorRole(membership?.role),
  };
}

/**
 * The one visibility rule for community posts, as a Payload filter. Every
 * list (feed, activity, pinned, reels) applies it, so a hidden or
 * community-only post can't leak through a list that forgot a check.
 */
export function postVisibilityWhere(viewer: FeedViewer): Where {
  const clauses: Where[] = [{ isDeleted: { not_equals: true } }];
  if (!viewer.isModerator) {
    clauses.push({
      or: [
        { hiddenAt: { exists: false } },
        ...(viewer.userId ? [{ authorId: { equals: viewer.userId } }] : []),
      ],
    });
  }
  if (!viewer.isMember) clauses.push({ visibility: { equals: "public" } });
  return { and: clauses };
}

/** The same rule for one already-loaded post. */
export function canViewPost(
  post: {
    authorId: string;
    isDeleted?: boolean | null;
    hiddenAt?: string | null;
    visibility?: string | null;
  },
  viewer: FeedViewer,
): boolean {
  if (post.isDeleted) return false;
  if (post.hiddenAt && !viewer.isModerator && post.authorId !== viewer.userId) {
    return false;
  }
  if (!viewer.isMember && post.visibility !== "public") return false;
  return true;
}
