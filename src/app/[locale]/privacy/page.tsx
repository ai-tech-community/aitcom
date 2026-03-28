import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import {
  ManPageLayout,
  ManPageSection,
  ManPageToc,
} from "@/components/man-page-layout";
import { Link } from "@/i18n/navigation";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "AIT Community Privacy Policy",
  ...buildOgMeta("Privacy Policy", "AIT Community Privacy Policy"),
  alternates: buildAlternates("/privacy"),
};

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");

  const tocItems = [
    { id: "data-collection", label: t("tocDataCollection") },
    { id: "legal-basis", label: t("tocLegalBasis") },
    { id: "data-sharing", label: t("tocDataSharing") },
    { id: "cookies", label: t("tocCookies") },
    { id: "retention", label: t("tocRetention") },
    { id: "rights", label: t("tocRights") },
    { id: "transfers", label: t("tocTransfers") },
    { id: "contact", label: t("tocContact") },
  ];

  return (
    <ManPageLayout pageName="PRIVACY" lastUpdated={t("lastUpdated")}>
      {/* NAME */}
      <section>
        <h2 className="font-mono text-sm font-bold tracking-wider">NAME</h2>
        <p className="text-muted-foreground mt-2 pl-6 font-mono text-sm">
          {t("name")}
        </p>
      </section>

      {/* SYNOPSIS */}
      <section className="mt-8">
        <h2 className="font-mono text-sm font-bold tracking-wider">SYNOPSIS</h2>
        <p className="text-muted-foreground mt-2 pl-6 text-sm leading-relaxed">
          {t("synopsis")}
        </p>
      </section>

      {/* DESCRIPTION */}
      <section className="mt-8">
        <h2 className="font-mono text-sm font-bold tracking-wider">DESCRIPTION</h2>
      </section>

      <ManPageToc items={tocItems} />

      <ManPageSection id="data-collection" title={t("tocDataCollection")}>
        <p className="whitespace-pre-line">{t("dataCollectionBody")}</p>
      </ManPageSection>

      <ManPageSection id="legal-basis" title={t("tocLegalBasis")}>
        <p className="whitespace-pre-line">{t("legalBasisBody")}</p>
      </ManPageSection>

      <ManPageSection id="data-sharing" title={t("tocDataSharing")}>
        <p className="whitespace-pre-line">{t("dataSharingBody")}</p>
      </ManPageSection>

      <ManPageSection id="cookies" title={t("tocCookies")}>
        <p className="whitespace-pre-line">{t("cookiesBody")}</p>
      </ManPageSection>

      <ManPageSection id="retention" title={t("tocRetention")}>
        <p className="whitespace-pre-line">{t("retentionBody")}</p>
      </ManPageSection>

      <ManPageSection id="rights" title={t("tocRights")}>
        <p className="whitespace-pre-line">{t("rightsBody")}</p>
      </ManPageSection>

      <ManPageSection id="transfers" title={t("tocTransfers")}>
        <p className="whitespace-pre-line">{t("transfersBody")}</p>
      </ManPageSection>

      <ManPageSection id="contact" title={t("tocContact")}>
        <p className="whitespace-pre-line">{t("contactBody")}</p>
      </ManPageSection>

      {/* SEE ALSO */}
      <section className="mt-10">
        <h2 className="font-mono text-sm font-bold tracking-wider">SEE ALSO</h2>
        <p className="mt-2 pl-6 font-mono text-sm">
          <Link href="/terms" className="text-primary hover:underline">
            {t("seeAlso")}
          </Link>
        </p>
      </section>
    </ManPageLayout>
  );
}
