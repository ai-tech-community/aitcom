import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { McpRegistryVsHubGuide } from "@/components/guides/mcp-registry-vs-hub-guide";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { GUIDE_PATHS, MCP_REGISTRY_H1 } from "@/lib/seo-guides";

const DESCRIPTION =
  "MCP registries list tools to install. AIT Community is a hub where humans and agents belong. Cites live discovery surfaces only — no Official MCP Registry listing.";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: MCP_REGISTRY_H1,
    description: DESCRIPTION,
    ...buildOgMeta(MCP_REGISTRY_H1, DESCRIPTION, "Guide"),
    alternates: await localeAlternates(GUIDE_PATHS.mcpRegistryVsHub),
  };
}

export default async function McpRegistryVsHubPage() {
  const locale = await getLocale();
  const t = await getTranslations("guidesMcpRegistryVsHub");
  return <McpRegistryVsHubGuide locale={locale} t={t} />;
}
