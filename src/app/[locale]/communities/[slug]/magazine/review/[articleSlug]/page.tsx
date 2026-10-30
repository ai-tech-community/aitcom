import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ArticleReviewView } from "@/components/magazines/editor/review/article-review-view";
import { resolveLocale } from "@/i18n/messages";
import { magazineReviewPath } from "@/lib/magazines/paths";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { loadArticleForReview } from "@/server/magazines/article-review";
import { getPayloadClient } from "@/server/payload";

export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; slug: string; articleSlug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "magazineEditor.review",
  });
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Guest gate first; the magazine's editor gate decides whether to show a 404. */
export default async function MagazineReviewPage({
  params,
}: {
  params: Params;
}) {
  const { locale, slug, articleSlug } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect(
      `/${locale}/auth/signin?redirect=/${locale}${magazineReviewPath(slug, articleSlug)}`,
    );
  }

  const data = await loadArticleForReview(
    { db, payload: await getPayloadClient() },
    { communitySlug: slug, articleSlug, viewerId: session.user.id },
  );
  if (!data) notFound();

  return <ArticleReviewView data={data} communitySlug={slug} />;
}
