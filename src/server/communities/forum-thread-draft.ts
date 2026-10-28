import { TRPCError } from "@trpc/server";

export const FORUM_THREAD_TITLE_MIN = 3;
export const FORUM_THREAD_TITLE_MAX = 255;
export const FORUM_THREAD_CONTENT_MAX = 10_000;

export const FORUM_THREAD_CATEGORIES = [
  "general",
  "question",
  "showcase",
  "job",
] as const;

export type ForumThreadCategory = (typeof FORUM_THREAD_CATEGORIES)[number];

export type ForumThreadDraft = {
  title: string;
  content: string;
  category: ForumThreadCategory;
  communitySlug?: string;
};

/** Slug the forum form stores: a short title stem plus the create time. */
export function forumThreadSlug(title: string, now = Date.now()): string {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${baseSlug}-${now}`;
}

/**
 * A provided community slug must name a live community. Omitting it is a
 * hub-wide thread, the same as the forum form without `?community=`.
 */
export function threadCommunityId(
  slug: string | undefined,
  community: { id: string } | null | undefined,
): string | undefined {
  if (!slug) return undefined;
  if (!community) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Community not found",
    });
  }
  return community.id;
}
