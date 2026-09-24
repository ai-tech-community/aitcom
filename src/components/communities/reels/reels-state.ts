/**
 * Pure helpers for Reels mode: reading the `?v=` deep link and the
 * optimistic like update applied to the cached reels pages.
 */

/** The post id in a `?v=` deep link, or null when it is not a valid id. */
export function parseReelPostId(
  raw: string | string[] | undefined,
): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

type LikeableReel = {
  id: number;
  hasLiked: boolean;
  likeCount?: number | null;
};
type ReelPages<T extends LikeableReel> = {
  pages: Array<{ items: T[] }>;
};

/**
 * Flips `hasLiked` on one reel and moves its count by one, returning new
 * objects only along the changed path so untouched reels keep their identity.
 */
export function toggleLikeInPages<
  T extends LikeableReel,
  D extends ReelPages<T>,
>(data: D | undefined, postId: number): D | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) =>
      page.items.some((item) => item.id === postId)
        ? {
            ...page,
            items: page.items.map((item) =>
              item.id === postId
                ? {
                    ...item,
                    hasLiked: !item.hasLiked,
                    likeCount: Math.max(
                      0,
                      (item.likeCount ?? 0) + (item.hasLiked ? -1 : 1),
                    ),
                  }
                : item,
            ),
          }
        : page,
    ),
  };
}
