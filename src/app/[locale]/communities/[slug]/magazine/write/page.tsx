import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { MagazineArticleWorkspace } from "@/components/magazines/editor/magazine-article-workspace";
import { resolveLocale } from "@/i18n/messages";
import { magazineWritePath } from "@/lib/magazines/paths";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { loadMagazineWriting } from "@/server/magazines/magazine-articles";
import { getPayloadClient } from "@/server/payload";

// Who may write is decided per request.
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "articleEditor.magazine",
  });
  return { title: t("writeMetaTitle"), robots: { index: false } };
}

/**
 * Writing a new article for the community's magazine, in the standard
 * community frame. Gate-Before-Fail: guests sign in first; anyone who does
 * not edit this community's magazine (or a community without one) gets a
 * 404.
 */
export default async function MagazineWritePage({
  params,
}: {
  params: Params;
}) {
  const { locale, slug } = await params;

  const session = await getSession();
  if (!session?.user) {
    redirect(
      `/${locale}/auth/signin?redirect=/${locale}${magazineWritePath(slug)}`,
    );
  }

  const writing = await loadMagazineWriting(
    { db, payload: await getPayloadClient() },
    { communitySlug: slug, viewerId: session.user.id },
  );
  if (!writing) notFound();

  return <MagazineArticleWorkspace communitySlug={slug} writing={writing} />;
}
