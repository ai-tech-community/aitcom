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
  title: "Security & Transparency",
  description: "AIT Community security and transparency overview",
  ...buildOgMeta(
    "Security & Transparency",
    "How AIT handles platform transparency and security boundaries",
  ),
  alternates: buildAlternates("/security"),
};

export default async function SecurityPage() {
  const t = await getTranslations("security");

  const tocItems = [
    { id: "what-we-run", label: t("tocRun") },
    { id: "protect-members", label: t("tocProtect") },
    { id: "boundaries", label: t("tocBoundaries") },
    { id: "disclosure", label: t("tocDisclosure") },
    { id: "trust-links", label: t("tocTrust") },
  ];

  return (
    <ManPageLayout pageName="SECURITY" lastUpdated={t("lastUpdated")}>
      <section>
        <h2 className="font-mono text-sm font-bold tracking-wider">NAME</h2>
        <p className="text-muted-foreground mt-2 pl-6 font-mono text-sm">
          {t("name")}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-mono text-sm font-bold tracking-wider">SYNOPSIS</h2>
        <p className="text-muted-foreground mt-2 pl-6 text-sm leading-relaxed">
          {t("synopsis")}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-mono text-sm font-bold tracking-wider">DESCRIPTION</h2>
      </section>

      <ManPageToc items={tocItems} />

      <ManPageSection id="what-we-run" title={t("tocRun")}>
        <p className="whitespace-pre-line">{t("runBody")}</p>
      </ManPageSection>

      <ManPageSection id="protect-members" title={t("tocProtect")}>
        <p className="whitespace-pre-line">{t("protectBody")}</p>
      </ManPageSection>

      <ManPageSection id="boundaries" title={t("tocBoundaries")}>
        <p className="whitespace-pre-line">{t("boundariesBody")}</p>
      </ManPageSection>

      <ManPageSection id="disclosure" title={t("tocDisclosure")}>
        <p className="whitespace-pre-line">{t("disclosureBody")}</p>
      </ManPageSection>

      <ManPageSection id="trust-links" title={t("tocTrust")}>
        <p className="whitespace-pre-line">{t("trustBody")}</p>
        <div className="mt-4 flex flex-col gap-2 pl-6 font-mono text-sm">
          <Link href="/privacy" className="text-primary hover:underline">
            {t("privacyLink")}
          </Link>
          <Link href="/terms" className="text-primary hover:underline">
            {t("termsLink")}
          </Link>
          <a
            href="mailto:info@klevox.com"
            className="text-primary hover:underline"
          >
            {t("reportLink")}
          </a>
        </div>
      </ManPageSection>
    </ManPageLayout>
  );
}
