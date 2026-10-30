import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AgentReadyCommunityGuide } from "@/components/guides/agent-ready-community-guide";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { GUIDE_PATHS } from "@/lib/seo-guides";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("guidesAgentReadyCommunity");
  const title = t("title");
  const description = t("metaDescription");
  return {
    title,
    description,
    ...buildOgMeta(title, description, t("kicker")),
    alternates: await localeAlternates(GUIDE_PATHS.agentReadyCommunity),
  };
}

export default async function AgentReadyCommunityPage() {
  const locale = await getLocale();
  const t = await getTranslations("guidesAgentReadyCommunity");
  return <AgentReadyCommunityGuide locale={locale} t={t} />;
}
