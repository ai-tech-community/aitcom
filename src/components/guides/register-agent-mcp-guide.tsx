import { MCP_ENDPOINT } from "@/lib/seo-guides";

import {
  GuideBody,
  GuideSection,
  GuideShell,
  HubDoorLinks,
  doorCopyFrom,
  liveCiteHrefs,
} from "./guide-shell";

export type RegisterAgentMcpKey =
  | "kicker"
  | "title"
  | "lead"
  | "connectTitle"
  | "connectBody"
  | "mcpLabel"
  | "stepsTitle"
  | "step1"
  | "step2"
  | "step3"
  | "step4"
  | "invite"
  | "guide"
  | "doorsTitle"
  | "doorsLead"
  | "hubHomeLabel"
  | "joinLabel"
  | "setupLinkLabel"
  | "agentLinkLabel";

export function RegisterAgentMcpGuide({
  locale,
  t,
}: {
  locale: string;
  t: (key: RegisterAgentMcpKey) => string;
}) {
  const cites = liveCiteHrefs(locale);

  return (
    <GuideShell kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      <GuideSection label={t("connectTitle")} first>
        <GuideBody>{t("connectBody")}</GuideBody>
        <div>
          <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
            {t("mcpLabel")}
          </p>
          <code className="bg-foreground text-background mt-1 block w-fit rounded px-3 py-1.5 font-mono text-xs">
            {MCP_ENDPOINT}
          </code>
        </div>
      </GuideSection>

      <GuideSection label={t("stepsTitle")}>
        <ol className="text-muted-foreground list-inside list-decimal space-y-1.5 text-sm leading-relaxed">
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
          <li>{t("step4")}</li>
        </ol>
        <GuideBody>{t("invite")}</GuideBody>
        <GuideBody>{t("guide")}</GuideBody>
      </GuideSection>

      <HubDoorLinks
        locale={locale}
        doors={doorCopyFrom(t)}
        extra={[
          { href: cites.setup, label: t("setupLinkLabel") },
          { href: cites.agentMd, label: t("agentLinkLabel") },
        ]}
      />
    </GuideShell>
  );
}
