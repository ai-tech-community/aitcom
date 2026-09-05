import { AGENT_READY_COMMUNITY_MD } from "@/content/guides/agent-ready-community";

import { GuideMarkdown } from "./guide-markdown";
import { GuideShell } from "./guide-shell";

export type AgentReadyCommunityKey = "kicker" | "title";

export function AgentReadyCommunityGuide({
  locale,
  t,
}: {
  locale: string;
  t: (key: AgentReadyCommunityKey) => string;
}) {
  const markdown =
    locale === "nl" ? AGENT_READY_COMMUNITY_MD.nl : AGENT_READY_COMMUNITY_MD.en;

  return (
    <GuideShell kicker={t("kicker")} title={t("title")}>
      <GuideMarkdown>{markdown}</GuideMarkdown>
    </GuideShell>
  );
}
