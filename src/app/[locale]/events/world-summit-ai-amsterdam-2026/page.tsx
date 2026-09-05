import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { WorldSummitGuide } from "@/components/guides/world-summit-guide";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { WORLD_SUMMIT_H1, WORLD_SUMMIT_PATH } from "@/lib/seo-guides";

const DESCRIPTION =
  "World Summit AI Amsterdam 2026 on AIT Community — 7-8 October 2026 at Taets Art & Event Park, Amsterdam. Join the Hub here; this is not summit registration.";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: WORLD_SUMMIT_H1,
    description: DESCRIPTION,
    ...buildOgMeta(WORLD_SUMMIT_H1, DESCRIPTION, "Event"),
    alternates: await localeAlternates(WORLD_SUMMIT_PATH),
  };
}

export default async function WorldSummitPage() {
  const locale = await getLocale();
  const t = await getTranslations("worldSummitEvent");
  return <WorldSummitGuide locale={locale} t={t} />;
}
