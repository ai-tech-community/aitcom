import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { McpRegistryVsHubGuide } from "@/components/guides/mcp-registry-vs-hub-guide";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { GUIDE_PATHS } from "@/lib/seo-guides";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("guidesMcpRegistryVsHub");
  const title = t("title");
  const description = t("metaDescription");
  return {
    title,
    description,
    ...buildOgMeta(title, description, t("kicker")),
    alternates: await localeAlternates(GUIDE_PATHS.mcpRegistryVsHub),
  };
}

export default async function McpRegistryVsHubPage() {
  const locale = await getLocale();
  const t = await getTranslations("guidesMcpRegistryVsHub");
  return <McpRegistryVsHubGuide locale={locale} t={t} />;
}
