import { revalidateTag } from "next/cache";

/** Shared by the news table query and the directory list it matches against. */
export const NEWS_TABLE_CACHE_TAG = "news-table";

/** Drop the cached table after a rumor or feed write. Safe outside a request. */
export function revalidateNewsTable(): void {
  try {
    revalidateTag(NEWS_TABLE_CACHE_TAG);
  } catch (err) {
    console.error("news: could not refresh the table cache", err);
  }
}
