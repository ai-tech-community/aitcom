import "server-only";

import { getTranslations } from "next-intl/server";

import { routing } from "@/i18n/routing";
import { db } from "@/server/db";
import { getPayloadClient } from "@/server/payload";
import { clientIpFromHeaders } from "@/server/rate-limit/client-ip";
import type { PerUserLimitResult } from "@/server/rate-limit/per-user-window";

import { loadShareCard } from "./share-cards";
import { loadShareCover, renderMagazineShareImage } from "./share-image";

export type ShareImageRouteContext = {
  params: Promise<{
    locale: string;
    magazineSlug: string;
    issueSlug: string;
    articleSlug?: string;
  }>;
};

/** Both routes share the anonymous read, safe cover fetch and uncached render. */
export async function magazineShareImage(
  request: Request,
  { params }: ShareImageRouteContext,
  limit: (key: string) => PerUserLimitResult,
) {
  const { locale: raw, magazineSlug, issueSlug, articleSlug } = await params;
  const locale =
    routing.locales.find((l) => l === raw) ?? routing.defaultLocale;
  const rate = limit(clientIpFromHeaders(request.headers));
  if (!rate.allowed)
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSecs) },
    });
  const card = await loadShareCard(
    { db, payload: await getPayloadClient() },
    { magazineSlug, issueSlug, articleSlug: articleSlug ?? null, locale },
  );
  if (!card) return new Response("Not found", { status: 404 });
  const t = await getTranslations({
    locale,
    namespace: "magazines.shareImage",
  });
  const image = renderMagazineShareImage(
    card,
    {
      issueLine: t("issueLine", {
        magazine: card.magazineName,
        number: card.issueNumber,
      }),
      byline: card.article?.authorName
        ? t("byAuthor", { author: card.article.authorName })
        : t("byCommunity", { community: card.communityName }),
    },
    await loadShareCover(card.coverImageUrl),
  );
  image.headers.set("Cache-Control", "no-store");
  return image;
}
