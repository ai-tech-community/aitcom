import { MCP_REGISTRY_VS_HUB_MD } from "@/content/guides/mcp-registry-vs-community-hub";

import { BuilderGuideFrame } from "@/components/builder/builder-guide-frame";
import { GuideMarkdown } from "./guide-markdown";
import { GuideShell } from "./guide-shell";

export type McpRegistryVsHubKey = "kicker" | "title";

export function McpRegistryVsHubGuide({
  locale,
  t,
  redesigned = false,
}: {
  locale: string;
  redesigned?: boolean;
  t: (key: McpRegistryVsHubKey) => string;
}) {
  const markdown =
    locale === "nl" ? MCP_REGISTRY_VS_HUB_MD.nl : MCP_REGISTRY_VS_HUB_MD.en;

  if (redesigned) {
    return (
      <BuilderGuideFrame current="hub" title={t("title")}>
        <GuideMarkdown redesigned>{markdown}</GuideMarkdown>
      </BuilderGuideFrame>
    );
  }

  return (
    <GuideShell kicker={t("kicker")} title={t("title")}>
      <GuideMarkdown>{markdown}</GuideMarkdown>
    </GuideShell>
  );
}
