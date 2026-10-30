import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { MagazineFontScope } from "@/components/magazines/reading/magazine-font-scope";
import { MagazineShelf } from "@/components/magazines/reading/magazine-shelf";
import { resolveLocale, type AppLocale } from "@/i18n/messages";
import { isShelfIndexable } from "@/lib/magazines/indexing";
import { magazinePath } from "@/lib/magazines/paths";
import { buildOgMeta, localeAlternates } from "@/lib/metadata";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { loadMagazineShelf } from "@/server/magazines/reading";
import { getPayloadClient } from "@/server/payload";

// Which issues show depends on the viewer and is decided per request: a
// visibility change shows on the next request (ADR-0042).
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; magazineSlug: string }>;

/** One load per request, shared by the metadata and the page. */
const loadPage = cache(async (magazineSlug: string, locale: AppLocale) => {
  const [session, payload] = await Promise.all([
    getSession(),
    getPayloadClient(),
  ]);
  return loadMagazineShelf(
    { db, payload },
    { magazineSlug, viewerId: session?.user?.id ?? null, locale },
  );
});

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale: rawLocale, magazineSlug } = await params;
  const locale = resolveLocale(rawLocale);
  const data = await loadPage(magazineSlug, locale);
  if (!data) return {};

  const { magazine, community, issues } = data;
  const t = await getTranslations({ locale, namespace: "magazines.meta" });
  const description =
    magazine.description ??
    t("shelfDescription", {
      magazine: magazine.name,
      community: community.name,
    });
  // Indexed once anyone may read an issue on it (the effective value,
  // preflight F10): a shelf of members-only issues stays out of search.
  const indexable = isShelfIndexable(magazine, issues);

  return {
    title: magazine.name,
    description,
    ...buildOgMeta(magazine.name, description, community.name),
    alternates: await localeAlternates(magazinePath(magazine)),
    ...(indexable ? {} : { robots: { index: false } }),
  };
}

export default async function MagazineShelfPage({
  params,
}: {
  params: Params;
}) {
  const { locale: rawLocale, magazineSlug } = await params;
  const data = await loadPage(magazineSlug, resolveLocale(rawLocale));
  if (!data) notFound();
  return (
    <MagazineFontScope
      font={data.magazine.font}
      fontPair={data.magazine.themeFontPair}
      accent={data.magazine.themeAccent}
    >
      <MagazineShelf data={data} />
    </MagazineFontScope>
  );
}
