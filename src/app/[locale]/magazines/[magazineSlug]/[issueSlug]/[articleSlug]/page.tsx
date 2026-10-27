import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { MagazineArticle } from "@/components/magazines/reading/magazine-article";
import { resolveLocale, type AppLocale } from "@/i18n/messages";
import {
  isMagazineArticleIndexable,
  isMagazineArticleOut,
} from "@/lib/magazines/indexing";
import { magazineArticlePath } from "@/lib/magazines/paths";
import {
  buildOgImageMeta,
  buildOgMeta,
  localeAlternates,
} from "@/lib/metadata";
import { listArticleComments } from "@/server/articles/article-comments";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { loadMagazineArticlePage } from "@/server/magazines/reading";
import { getPayloadClient } from "@/server/payload";

// Access is decided per request: a visibility change shows on the next
// request (ADR-0042), never from a cache.
export const dynamic = "force-dynamic";

type Params = Promise<{
  locale: string;
  magazineSlug: string;
  issueSlug: string;
  articleSlug: string;
}>;

/** One load per request, shared by the metadata and the page. */
const loadPage = cache(
  async (
    magazineSlug: string,
    issueSlug: string,
    articleSlug: string,
    locale: AppLocale,
  ) => {
    const [session, payload] = await Promise.all([
      getSession(),
      getPayloadClient(),
    ]);
    const viewerId = session?.user?.id ?? null;
    const data = await loadMagazineArticlePage(
      { db, payload },
      { magazineSlug, issueSlug, articleSlug, viewerId, locale },
    );
    return data ? { data, payload, viewerId } : null;
  },
);

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const {
    locale: rawLocale,
    magazineSlug,
    issueSlug,
    articleSlug,
  } = await params;
  const locale = resolveLocale(rawLocale);
  const loaded = await loadPage(magazineSlug, issueSlug, articleSlug, locale);
  if (!loaded) return {};

  const { magazine, issue, article } = loaded.data;
  const t = await getTranslations({ locale, namespace: "magazines.meta" });
  const title = `${article.title} · ${magazine.name}`;
  const description = t("articleDescription", {
    number: issue.number,
    magazine: magazine.name,
    community: issue.community.name,
  });

  return {
    title,
    description,
    ...(article.mediaUrl
      ? buildOgImageMeta(title, description, article.mediaUrl)
      : buildOgMeta(article.title, description, magazine.name)),
    alternates: await localeAlternates(
      magazineArticlePath(magazine, issue, article),
    ),
    // The effective visibility, so an unconfirmed public issue in an
    // unlisted community stays out of search (F10).
    ...(isMagazineArticleIndexable(issue, article, magazine)
      ? {}
      : { robots: { index: false } }),
  };
}

export default async function MagazineArticlePage({
  params,
}: {
  params: Params;
}) {
  const {
    locale: rawLocale,
    magazineSlug,
    issueSlug,
    articleSlug,
  } = await params;
  const locale = resolveLocale(rawLocale);
  const loaded = await loadPage(magazineSlug, issueSlug, articleSlug, locale);
  if (!loaded) notFound();

  const { data, payload, viewerId } = loaded;
  // The read model has already decided the viewer may read this article,
  // and so its comments. An editor's preview has no comment thread.
  const comments = isMagazineArticleOut(data.issue, data.article)
    ? await listArticleComments(payload, data.article.id)
    : [];
  return (
    <MagazineArticle
      data={data}
      comments={comments}
      currentUserId={viewerId ?? undefined}
    />
  );
}
