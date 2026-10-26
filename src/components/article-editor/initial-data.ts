import type { Article } from "@/payload-types";

import type { ArticleEditorProps } from "./types";

/** A saved article as the editor opens it, for every edit page. */
export function articleEditorInitialData(
  article: Article,
): NonNullable<ArticleEditorProps["initialData"]> {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    content: article.content,
    type: article.type as "article" | "tutorial",
    tags: (article.tags as { tag: string }[]) ?? [],
    mediaUrl: article.mediaUrl ?? undefined,
    reviewStatus: article.reviewStatus ?? undefined,
    reviewNote: article.reviewNote ?? undefined,
  };
}
