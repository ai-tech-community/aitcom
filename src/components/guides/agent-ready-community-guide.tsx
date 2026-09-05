import { AGENT_READY_GREENS, AGENT_READY_URL } from "@/lib/seo-guides";

import {
  GuideBody,
  GuideSection,
  GuideShell,
  HubDoorLinks,
  doorCopyFrom,
  liveCiteHrefs,
} from "./guide-shell";

export type AgentReadyCommunityKey =
  | "kicker"
  | "title"
  | "lead"
  | "scanTitle"
  | "scanBody"
  | "greensTitle"
  | "greensBody"
  | "authTitle"
  | "authBody"
  | "liveTitle"
  | "liveBody"
  | "doorsTitle"
  | "doorsLead"
  | "hubHomeLabel"
  | "joinLabel"
  | "setupLinkLabel"
  | "agentLinkLabel"
  | "mcpLinkLabel"
  | "isitLinkLabel";

export function AgentReadyCommunityGuide({
  locale,
  t,
}: {
  locale: string;
  t: (key: AgentReadyCommunityKey) => string;
}) {
  const cites = liveCiteHrefs(locale);

  return (
    <GuideShell kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      <GuideSection label={t("scanTitle")} first>
        <GuideBody>{t("scanBody")}</GuideBody>
        <code className="bg-foreground text-background mt-1 block w-fit rounded px-3 py-1.5 font-mono text-xs break-all">
          {AGENT_READY_URL}
        </code>
      </GuideSection>

      <GuideSection label={t("greensTitle")}>
        <GuideBody>{t("greensBody")}</GuideBody>
        <ul className="text-muted-foreground list-inside list-disc space-y-1.5 text-sm leading-relaxed">
          {AGENT_READY_GREENS.map((green) => (
            <li key={green}>{green}</li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection label={t("authTitle")}>
        <GuideBody>{t("authBody")}</GuideBody>
      </GuideSection>

      <GuideSection label={t("liveTitle")}>
        <GuideBody>{t("liveBody")}</GuideBody>
      </GuideSection>

      <HubDoorLinks
        locale={locale}
        doors={doorCopyFrom(t)}
        extra={[
          { href: AGENT_READY_URL, label: t("isitLinkLabel") },
          { href: cites.agentMd, label: t("agentLinkLabel") },
          { href: cites.mcp, label: t("mcpLinkLabel") },
          { href: cites.setup, label: t("setupLinkLabel") },
        ]}
      />
    </GuideShell>
  );
}
