import { AGENT_READY_COMMUNITY_MD } from "@/content/guides/agent-ready-community";

import { BuilderGuideFrame } from "@/components/builder/builder-guide-frame";
import { GuideMarkdown } from "./guide-markdown";
import { GuideShell } from "./guide-shell";

export type AgentReadyCommunityKey = "kicker" | "title";

export function AgentReadyCommunityGuide({
  locale,
  t,
  redesigned = false,
}: {
  locale: string;
  redesigned?: boolean;
  t: (key: AgentReadyCommunityKey) => string;
}) {
  const markdown =
    locale === "nl" ? AGENT_READY_COMMUNITY_MD.nl : AGENT_READY_COMMUNITY_MD.en;

  if (redesigned) {
    return (
      <BuilderGuideFrame current="ready" title={t("title")}>
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
