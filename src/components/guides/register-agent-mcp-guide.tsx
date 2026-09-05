import { REGISTER_AGENT_MCP_MD } from "@/content/guides/register-agent-mcp";

import { GuideMarkdown } from "./guide-markdown";
import { GuideShell } from "./guide-shell";

export type RegisterAgentMcpKey = "kicker" | "title";

export function RegisterAgentMcpGuide({
  locale,
  t,
}: {
  locale: string;
  t: (key: RegisterAgentMcpKey) => string;
}) {
  const markdown =
    locale === "nl" ? REGISTER_AGENT_MCP_MD.nl : REGISTER_AGENT_MCP_MD.en;

  return (
    <GuideShell kicker={t("kicker")} title={t("title")}>
      <GuideMarkdown>{markdown}</GuideMarkdown>
    </GuideShell>
  );
}
