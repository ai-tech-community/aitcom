import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { MagazineTab } from "@/components/magazines/community/magazine-tab";
import { resolveLocale, type AppLocale } from "@/i18n/messages";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { loadCommunityMagazineTab } from "@/server/magazines/reading";
import { getPayloadClient } from "@/server/payload";

// Which issues show depends on the viewer and is decided per request: a
// visibility change shows on the next request (ADR-0042).
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; slug: string }>;

/**
 * One load per request, shared by the metadata and the page. `null` when
 * the tab is a 404 for this viewer: the read model's 404, or a community
 * without a magazine for anyone who cannot start one (preflight F8).
 */
const loadPage = cache(async (communitySlug: string, locale: AppLocale) => {
  const [session, payload] = await Promise.all([
    getSession(),
    getPayloadClient(),
  ]);
  const data = await loadCommunityMagazineTab(
    { db, payload },
    { communitySlug, viewerId: session?.user?.id ?? null, locale },
  );
  if (!data || (data.magazine === null && !data.viewerIsEditor)) return null;
  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  const data = await loadPage(slug, locale);
  if (!data) return {};
  const t = await getTranslations({ locale, namespace: "magazineEditor.tab" });
  return {
    title: data.magazine?.name ?? t("metaTitle"),
    // The magazine's shelf (`/magazines/<magazine>`) is its public page.
    robots: { index: false },
  };
}

export default async function CommunityMagazinePage({
  params,
}: {
  params: Params;
}) {
  const { locale: rawLocale, slug } = await params;
  const data = await loadPage(slug, resolveLocale(rawLocale));
  if (!data) notFound();
  return <MagazineTab data={data} communitySlug={slug} />;
}
