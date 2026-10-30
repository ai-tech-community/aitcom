import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { MagazinesHome } from "@/components/magazines/reading/magazines-home";
import { resolveLocale } from "@/i18n/messages";
import { MAGAZINES_HOME_PATH } from "@/lib/magazines/paths";
import { buildOgMeta, localeAlternates } from "@/lib/metadata";
import { db } from "@/server/db";
import { normalizeTopics } from "@/server/magazines/magazine-service";
import { loadMagazinesHome } from "@/server/magazines/reading";
import { getPayloadClient } from "@/server/payload";

// Only public issues are listed, decided per request: an issue switched to
// members-only leaves this page on the next request (ADR-0042).
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The `?topic=` filter as the read model compares it, or null. */
function activeTopicOf(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ? (normalizeTopics([value])[0] ?? null) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "magazines.meta" });
  const title = t("homeTitle");
  const description = t("homeDescription");
  return {
    title,
    description,
    ...buildOgMeta(title, description, title),
    // Topic views are filters of one page: they share its canonical URL.
    alternates: await localeAlternates(MAGAZINES_HOME_PATH),
  };
}

export default async function MagazinesHomePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ locale: rawLocale }, query, payload] = await Promise.all([
    params,
    searchParams,
    getPayloadClient(),
  ]);
  const activeTopic = activeTopicOf(query.topic);
  const data = await loadMagazinesHome(
    { db, payload },
    {
      locale: resolveLocale(rawLocale),
      ...(activeTopic ? { topic: activeTopic } : {}),
    },
  );
  return <MagazinesHome data={data} activeTopic={activeTopic} />;
}
