import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ManPageLayout, ManPageSection } from "@/components/man-page-layout";
import { buildOgMeta, localeAlternates } from "@/lib/metadata";
import {
  COLLECTOR_ABOUT_PATH,
  COLLECTOR_OPT_OUT_EMAIL,
  COLLECTOR_ROBOTS_TOKEN,
  COLLECTOR_USER_AGENT,
} from "@/server/collectors/identity";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("collectorsAbout");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...buildOgMeta(t("metaTitle"), t("metaDescription")),
    alternates: await localeAlternates(COLLECTOR_ABOUT_PATH),
  };
}

const codeBlock =
  "bg-sidebar border-border text-foreground rounded-lg border p-3 font-mono text-[13px] whitespace-pre-wrap";

/** Public page for site owners: what our visitor is and how to block it. */
export default async function CollectorAboutPage() {
  const t = await getTranslations("collectorsAbout");
  return (
    <ManPageLayout pageName="COLLECTOR" lastUpdated={t("lastUpdated")}>
      <ManPageSection id="name" title={t("name")}>
        <p className="font-mono">{t("nameText")}</p>
      </ManPageSection>
      <ManPageSection id="description" title={t("description")}>
        <p>{t("descriptionText1")}</p>
        <p className="mt-2.5">{t("descriptionText2")}</p>
      </ManPageSection>
      <ManPageSection id="behaviour" title={t("behaves")}>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t("behaves1")}</li>
          <li>{t("behaves2")}</li>
          <li>{t("behaves3")}</li>
          <li>{t("behaves4")}</li>
          <li>{t("behaves5")}</li>
        </ul>
      </ManPageSection>
      <ManPageSection id="user-agent" title={t("userAgent")}>
        <pre className={codeBlock}>{COLLECTOR_USER_AGENT}</pre>
      </ManPageSection>
      <ManPageSection id="blocking" title={t("blocking")}>
        <p>{t("blockingText")}</p>
        <pre
          className={`${codeBlock} mt-2.5`}
        >{`User-agent: ${COLLECTOR_ROBOTS_TOKEN}\nDisallow: /`}</pre>
        <p className="mt-2.5">
          {t.rich("blockingPartial", {
            example: () => (
              <code className="font-mono text-[13px]">Disallow: /private/</code>
            ),
          })}
        </p>
      </ManPageSection>
      <ManPageSection id="opt-out" title={t("optOut")}>
        <p>
          {t.rich("optOutText", {
            email: () => (
              <a
                href={`mailto:${COLLECTOR_OPT_OUT_EMAIL}`}
                className="text-primary hover:underline"
              >
                {COLLECTOR_OPT_OUT_EMAIL}
              </a>
            ),
          })}
        </p>
      </ManPageSection>
    </ManPageLayout>
  );
}
