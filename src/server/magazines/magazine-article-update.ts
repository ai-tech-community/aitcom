import { TRPCError } from "@trpc/server";

import type { getPayloadClient } from "@/server/payload";

import { magazineArticlePatch } from "./agent-article-body";

/** A change to an article that is already published. Approval writes the live article. */
export const MAGAZINE_ARTICLE_UPDATE_DRAFT_TYPE = "magazine_article_update";

export type MagazineArticleUpdate = {
  articleId: number;
  title?: string;
  body?: string;
  coverImageUrl?: string | null;
  videoUrl?: string;
};

export function magazineArticleUpdateFromDraft(draft: {
  metadata: unknown;
}): MagazineArticleUpdate {
  const meta =
    draft.metadata && typeof draft.metadata === "object"
      ? (draft.metadata as Record<string, unknown>)
      : null;
  const articleId = meta?.articleId;
  if (typeof articleId !== "number") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This article draft has no article.",
    });
  }
  const title = meta?.title;
  const body = meta?.body;
  const coverImageUrl = meta?.coverImageUrl;
  const videoUrl = meta?.videoUrl;
  if (title !== undefined && typeof title !== "string") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This article draft has no usable title.",
    });
  }
  if (body !== undefined && typeof body !== "string") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This article draft has no usable body.",
    });
  }
  if (
    coverImageUrl !== undefined &&
    coverImageUrl !== null &&
    typeof coverImageUrl !== "string"
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This article draft has no usable cover.",
    });
  }
  if (videoUrl !== undefined && typeof videoUrl !== "string") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This article draft has no usable video.",
    });
  }
  return {
    articleId,
    ...(typeof title === "string" ? { title } : {}),
    ...(typeof body === "string" ? { body } : {}),
    ...(coverImageUrl === null || typeof coverImageUrl === "string"
      ? { coverImageUrl }
      : {}),
    ...(typeof videoUrl === "string" ? { videoUrl } : {}),
  };
}

export async function applyMagazineArticleUpdate(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  update: MagazineArticleUpdate,
): Promise<void> {
  const article = await payload.findByID({
    collection: "articles",
    id: update.articleId,
    draft: true,
    depth: 0,
  });
  await payload.update({
    collection: "articles",
    id: article.id,
    draft: article.status !== "published",
    depth: 0,
    data: magazineArticlePatch({
      title: update.title,
      body: update.body,
      mediaUrl: update.coverImageUrl,
      videoUrl: update.videoUrl,
      existingContent: article.content,
    }),
  });
}
