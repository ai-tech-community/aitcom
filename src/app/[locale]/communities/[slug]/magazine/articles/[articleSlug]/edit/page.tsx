import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { articleEditorInitialData } from "@/components/article-editor/initial-data";
import { MagazineArticleWorkspace } from "@/components/magazines/editor/magazine-article-workspace";
import { resolveLocale } from "@/i18n/messages";
import {
  communityMagazinePath,
  magazineArticleEditPath,
} from "@/lib/magazines/paths";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { loadMagazineArticleForEditing } from "@/server/magazines/magazine-articles";
import { getPayloadClient } from "@/server/payload";

// Who may edit is decided per request.
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
    namespace: "articleEditor.magazine",
  });
  return { title: t("editMetaTitle"), robots: { index: false } };
}

/**
 * Editing one of the viewer's magazine articles, in the standard community
 * frame. Gate-Before-Fail: guests sign in first; the article must belong to
 * this community's magazine, and the viewer must write for that magazine and be
 * the article's author — anything else is a 404. Locked articles return
 * the writer to their desk.
 */
export default async function MagazineArticleEditPage({
  params,
}: {
  params: Params;
}) {
  const { locale, slug, articleSlug } = await params;

  const session = await getSession();
  if (!session?.user) {
    redirect(
      `/${locale}/auth/signin?redirect=/${locale}${magazineArticleEditPath(slug, articleSlug)}`,
    );
  }

  const editing = await loadMagazineArticleForEditing(
    { db, payload: await getPayloadClient() },
    { communitySlug: slug, articleSlug, viewerId: session.user.id },
  );
  if (!editing) notFound();

  const { article, editable, ...writing } = editing;
  if (!editable) redirect(`/${locale}${communityMagazinePath(slug)}`);
  return (
    <MagazineArticleWorkspace
      communitySlug={slug}
      writing={writing}
      initialData={articleEditorInitialData(article)}
    />
  );
}
