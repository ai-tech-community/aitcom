import { REGISTER_AGENT_MCP_MD } from "@/content/guides/register-agent-mcp";

import { BuilderGuideFrame } from "@/components/builder/builder-guide-frame";
import { GuideMarkdown } from "./guide-markdown";
import { GuideShell } from "./guide-shell";

export type RegisterAgentMcpKey = "kicker" | "title";

export function RegisterAgentMcpGuide({
  locale,
  t,
  redesigned = false,
}: {
  locale: string;
  redesigned?: boolean;
  t: (key: RegisterAgentMcpKey) => string;
}) {
  const markdown =
    locale === "nl" ? REGISTER_AGENT_MCP_MD.nl : REGISTER_AGENT_MCP_MD.en;

  if (redesigned) {
    return (
      <BuilderGuideFrame current="register" title={t("title")}>
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
