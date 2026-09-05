import { WORLD_SUMMIT_DATES, WORLD_SUMMIT_VENUE } from "@/lib/seo-guides";

import {
  GuideBody,
  GuideSection,
  GuideShell,
  HubDoorLinks,
  doorCopyFrom,
} from "./guide-shell";

export type WorldSummitKey =
  | "kicker"
  | "title"
  | "lead"
  | "whenTitle"
  | "whenBody"
  | "dateLabel"
  | "venueLabel"
  | "aboutTitle"
  | "aboutBody"
  | "ctaTitle"
  | "ctaBody"
  | "doorsTitle"
  | "doorsLead"
  | "hubHomeLabel"
  | "joinLabel";

export function WorldSummitGuide({
  locale,
  t,
}: {
  locale: string;
  t: (key: WorldSummitKey) => string;
}) {
  return (
    <GuideShell kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      <GuideSection label={t("whenTitle")} first>
        <GuideBody>{t("whenBody")}</GuideBody>
        <dl className="text-muted-foreground grid gap-3 text-sm">
          <div>
            <dt className="font-mono text-xs tracking-wider uppercase">
              {t("dateLabel")}
            </dt>
            <dd className="mt-1">{WORLD_SUMMIT_DATES}</dd>
          </div>
          <div>
            <dt className="font-mono text-xs tracking-wider uppercase">
              {t("venueLabel")}
            </dt>
            <dd className="mt-1">{WORLD_SUMMIT_VENUE}</dd>
          </div>
        </dl>
      </GuideSection>

      <GuideSection label={t("aboutTitle")}>
        <GuideBody>{t("aboutBody")}</GuideBody>
      </GuideSection>

      <GuideSection label={t("ctaTitle")}>
        <GuideBody>{t("ctaBody")}</GuideBody>
      </GuideSection>

      <HubDoorLinks locale={locale} doors={doorCopyFrom(t)} />
    </GuideShell>
  );
}
