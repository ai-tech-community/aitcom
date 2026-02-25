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
  title: "Terms of Service",
  description: "AIT Community Terms of Service",
  ...buildOgMeta("Terms of Service", "AIT Community Terms of Service"),
  alternates: buildAlternates("/terms"),
};

export default async function TermsPage() {
  const t = await getTranslations("terms");

  const tocItems = [
    { id: "acceptance", label: t("tocAcceptance") },
    { id: "accounts", label: t("tocAccounts") },
    { id: "community", label: t("tocCommunity") },
    { id: "events", label: t("tocEvents") },
    { id: "sponsors", label: t("tocSponsors") },
    { id: "ip", label: t("tocIp") },
    { id: "liability", label: t("tocLiability") },
    { id: "termination", label: t("tocTermination") },
    { id: "governing", label: t("tocGoverning") },
    { id: "changes", label: t("tocChanges") },
  ];

  return (
    <ManPageLayout pageName="TERMS" lastUpdated={t("lastUpdated")}>
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

      <ManPageSection id="acceptance" title={t("tocAcceptance")}>
        <p className="whitespace-pre-line">{t("acceptanceBody")}</p>
      </ManPageSection>

      <ManPageSection id="accounts" title={t("tocAccounts")}>
        <p className="whitespace-pre-line">{t("accountsBody")}</p>
      </ManPageSection>

      <ManPageSection id="community" title={t("tocCommunity")}>
        <p className="whitespace-pre-line">{t("communityBody")}</p>
      </ManPageSection>

      <ManPageSection id="events" title={t("tocEvents")}>
        <p className="whitespace-pre-line">{t("eventsBody")}</p>
      </ManPageSection>

      <ManPageSection id="sponsors" title={t("tocSponsors")}>
        <p className="whitespace-pre-line">{t("sponsorsBody")}</p>
      </ManPageSection>

      <ManPageSection id="ip" title={t("tocIp")}>
        <p className="whitespace-pre-line">{t("ipBody")}</p>
      </ManPageSection>

      <ManPageSection id="liability" title={t("tocLiability")}>
        <p className="whitespace-pre-line">{t("liabilityBody")}</p>
      </ManPageSection>

      <ManPageSection id="termination" title={t("tocTermination")}>
        <p className="whitespace-pre-line">{t("terminationBody")}</p>
      </ManPageSection>

      <ManPageSection id="governing" title={t("tocGoverning")}>
        <p className="whitespace-pre-line">{t("governingBody")}</p>
      </ManPageSection>

      <ManPageSection id="changes" title={t("tocChanges")}>
        <p className="whitespace-pre-line">{t("changesBody")}</p>
      </ManPageSection>

      {/* SEE ALSO */}
      <section className="mt-10">
        <h2 className="font-mono text-sm font-bold tracking-wider">SEE ALSO</h2>
        <p className="mt-2 pl-6 font-mono text-sm">
          <Link href="/privacy" className="text-primary hover:underline">
            {t("seeAlso")}
          </Link>
        </p>
      </section>
    </ManPageLayout>
  );
}
