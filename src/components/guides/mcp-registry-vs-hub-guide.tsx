import { AGENT_READY_GREENS, AGENT_READY_URL } from "@/lib/seo-guides";

import {
  GuideBody,
  GuideSection,
  GuideShell,
  HubDoorLinks,
  doorCopyFrom,
  liveCiteHrefs,
} from "./guide-shell";

export type McpRegistryVsHubKey =
  | "kicker"
  | "title"
  | "lead"
  | "registryTitle"
  | "registryBody"
  | "hubTitle"
  | "hubBody"
  | "liveTitle"
  | "liveBody"
  | "authNote"
  | "doorsTitle"
  | "doorsLead"
  | "hubHomeLabel"
  | "joinLabel"
  | "setupLinkLabel"
  | "agentLinkLabel"
  | "mcpLinkLabel"
  | "isitLinkLabel";

export function McpRegistryVsHubGuide({
  locale,
  t,
}: {
  locale: string;
  t: (key: McpRegistryVsHubKey) => string;
}) {
  const cites = liveCiteHrefs(locale);

  return (
    <GuideShell kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      <GuideSection label={t("registryTitle")} first>
        <GuideBody>{t("registryBody")}</GuideBody>
      </GuideSection>

      <GuideSection label={t("hubTitle")}>
        <GuideBody>{t("hubBody")}</GuideBody>
      </GuideSection>

      <GuideSection label={t("liveTitle")}>
        <GuideBody>{t("liveBody")}</GuideBody>
        <ul className="text-muted-foreground list-inside list-disc space-y-1.5 text-sm leading-relaxed">
          {AGENT_READY_GREENS.map((green) => (
            <li key={green}>{green}</li>
          ))}
        </ul>
        <GuideBody>{t("authNote")}</GuideBody>
      </GuideSection>

      <HubDoorLinks
        locale={locale}
        doors={doorCopyFrom(t)}
        extra={[
          { href: cites.setup, label: t("setupLinkLabel") },
          { href: cites.agentMd, label: t("agentLinkLabel") },
          { href: cites.mcp, label: t("mcpLinkLabel") },
          { href: AGENT_READY_URL, label: t("isitLinkLabel") },
        ]}
      />
    </GuideShell>
  );
}
