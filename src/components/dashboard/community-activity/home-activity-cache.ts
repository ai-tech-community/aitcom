/**
 * In-place updates to Home's cached activity pages, so a like or a delete
 * changes one entry instead of refetching every page already loaded.
 * Untouched pages and entries keep their identity.
 */

type PostEntry = {
  kind: string;
  post?: { id: number; hasLiked: boolean; likeCount?: number | null };
};
type Pages<T> = { pages: Array<{ items: T[] }> };

function isPost<T extends PostEntry>(item: T, postId: number): boolean {
  return item.kind === "post" && item.post?.id === postId;
}

/** The like state the server returned, on the one post it belongs to. */
export function setPostLike<T extends PostEntry, D extends Pages<T>>(
  data: D | undefined,
  postId: number,
  like: { liked: boolean; likeCount: number },
): D | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) =>
      page.items.some((item) => isPost(item, postId))
        ? {
            ...page,
            items: page.items.map((item) =>
              isPost(item, postId)
                ? {
                    ...item,
                    post: {
                      ...item.post!,
                      hasLiked: like.liked,
                      likeCount: like.likeCount,
                    },
                  }
                : item,
            ),
          }
        : page,
    ),
  };
}

/** Drops a deleted post. Page cursors stay as they were. */
export function removePost<T extends PostEntry, D extends Pages<T>>(
  data: D | undefined,
  postId: number,
): D | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) =>
      page.items.some((item) => isPost(item, postId))
        ? { ...page, items: page.items.filter((item) => !isPost(item, postId)) }
        : page,
    ),
  };
}
