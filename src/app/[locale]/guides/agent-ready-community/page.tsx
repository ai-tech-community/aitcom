import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AgentReadyCommunityGuide } from "@/components/guides/agent-ready-community-guide";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import {
  AGENT_READY_H1,
  AGENT_READY_META,
  GUIDE_PATHS,
} from "@/lib/seo-guides";

const DESCRIPTION = AGENT_READY_META;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: AGENT_READY_H1,
    description: DESCRIPTION,
    ...buildOgMeta(AGENT_READY_H1, DESCRIPTION, "Guide"),
    alternates: await localeAlternates(GUIDE_PATHS.agentReadyCommunity),
  };
}

export default async function AgentReadyCommunityPage() {
  const locale = await getLocale();
  const t = await getTranslations("guidesAgentReadyCommunity");
  return <AgentReadyCommunityGuide locale={locale} t={t} />;
}
