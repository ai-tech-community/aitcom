import { getFormatter, getTranslations } from "next-intl/server";

import { DashboardSection } from "@/components/datacenters/dashboard-section";
import {
  AnnounceTrendChart,
  CountryScatter,
  OperatorPowerMixStack,
  PowerSourcePie,
  SupplierCategoryBar,
} from "@/components/datacenters/investigation-charts";
import {
  getDatacenterStats,
  getInvestigationStats,
} from "@/server/datacenters/dashboard-data";
import { datacenterTabMetadata } from "@/server/datacenters/tab-metadata";

export const revalidate = 300;

export function generateMetadata() {
  return datacenterTabMetadata("energyGrowth");
}

export default async function DatacenterEnergyGrowthPage() {
  const [t, format, stats, dash] = await Promise.all([
    getTranslations("datacenterInvestigation.energyGrowth"),
    getFormatter(),
    getDatacenterStats(),
    getInvestigationStats(),
  ]);
  const lag = dash.lagStats;

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-x-6">
      <DashboardSection title={t("powerMix")} framed>
        <PowerSourcePie data={dash.byPowerSource} />
      </DashboardSection>

      <DashboardSection title={t("countries")} framed>
        <CountryScatter data={stats.byCountry} />
      </DashboardSection>

      <DashboardSection
        title={t("operatorPowerMix")}
        hint={t("operatorPowerMixHint")}
        framed
        className="lg:col-span-2"
      >
        <OperatorPowerMixStack data={dash.operatorPowerMix} />
      </DashboardSection>

      <DashboardSection
        title={t("announcements")}
        hint={
          lag.sample_size > 0
            ? t("medianLag", {
                years: format.number(Math.round(lag.median_lag_days / 365)),
                count: format.number(lag.sample_size),
              })
            : undefined
        }
        framed
        className="lg:col-span-2"
      >
        <AnnounceTrendChart data={dash.announceTrend} />
      </DashboardSection>

      <DashboardSection
        title={t("supplierCategories")}
        framed
        className="lg:col-span-2"
      >
        <SupplierCategoryBar data={dash.topSupplierCategories} />
      </DashboardSection>
    </div>
  );
}
