import { MCP_REGISTRY_VS_HUB_MD } from "@/content/guides/mcp-registry-vs-community-hub";

import { GuideMarkdown } from "./guide-markdown";
import { GuideShell } from "./guide-shell";

export type McpRegistryVsHubKey = "kicker" | "title";

export function McpRegistryVsHubGuide({
  locale,
  t,
}: {
  locale: string;
  t: (key: McpRegistryVsHubKey) => string;
}) {
  const markdown =
    locale === "nl" ? MCP_REGISTRY_VS_HUB_MD.nl : MCP_REGISTRY_VS_HUB_MD.en;

  return (
    <GuideShell kicker={t("kicker")} title={t("title")}>
      <GuideMarkdown>{markdown}</GuideMarkdown>
    </GuideShell>
  );
}
