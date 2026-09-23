import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/server";
import { DashboardSection } from "@/components/datacenters/dashboard-section";
import { GreenwashPanel } from "@/components/datacenters/greenwash-panel";
import { RedFlagsPanel } from "@/components/datacenters/red-flags-panel";
import { METHOD_PATH } from "@/lib/investigations/datacenter-flag-method";
import { getInvestigationStats } from "@/server/datacenters/dashboard-data";
import { datacenterTabMetadata } from "@/server/datacenters/tab-metadata";

export const revalidate = 300;

export function generateMetadata() {
  return datacenterTabMetadata("redFlags");
}

export default async function DatacenterRedFlagsPage() {
  const [t, dash, phase5] = await Promise.all([
    getTranslations("datacenterInvestigation.redFlags"),
    getInvestigationStats(),
    api.datacenters.phase5RedFlags(),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <DashboardSection
        title={t("anomalies")}
        hint={t("anomaliesHint")}
        action={
          <Link
            href={METHOD_PATH}
            className="text-muted-foreground hover:text-foreground text-sm hover:underline"
          >
            {t("howWeFlag")}
          </Link>
        }
      >
        <RedFlagsPanel flags={dash.redFlags} phase5={phase5} />
      </DashboardSection>

      <DashboardSection title={t("greenwash")} hint={t("greenwashHint")} framed>
        {/* The gap table is wider than a phone; let it scroll inside its frame. */}
        <div className="overflow-x-auto">
          <GreenwashPanel data={dash.greenwashGap as never} />
        </div>
      </DashboardSection>
    </div>
  );
}
