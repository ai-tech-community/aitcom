import { ArrowLeft } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { MissionDialog } from "@/components/datacenters/mission-dialog";
import { RouteTabs } from "@/components/ui/route-tabs";
import {
  DATACENTER_TABS,
  datacenterTabPath,
} from "@/lib/investigations/datacenter-investigation-routes";
import {
  getDatacenterStats,
  getInvestigationStats,
} from "@/server/datacenters/dashboard-data";

/**
 * Shell shared by every tab of the AI Datacenters investigation: title, the
 * headline numbers, and the tab bar. Each tab is its own route in this group.
 */
export default async function DatacenterInvestigationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [t, format, stats, dash] = await Promise.all([
    getTranslations("datacenterInvestigation"),
    getFormatter(),
    getDatacenterStats(),
    getInvestigationStats(),
  ]);

  // Top-3 operator concentration globally (operators by total announced + planned MW)
  const operatorMw = dash.topOperators.map((o) => o.mw + o.plannedMw);
  const allOpMw = operatorMw.reduce((s, mw) => s + mw, 0);
  const top3Mw = operatorMw.slice(0, 3).reduce((s, mw) => s + mw, 0);
  const top3Pct = allOpMw > 0 ? top3Mw / allOpMw : 0;

  const totalCapacityMw = Math.round(
    stats.totals.totalMw + stats.totals.plannedMw,
  );
  const plannedMw = Math.round(stats.totals.plannedMw);

  const headline = [
    {
      label: t("stats.facilities"),
      value: format.number(stats.totals.count),
    },
    {
      label: t("stats.capacity"),
      value: t("stats.mw", { mw: format.number(totalCapacityMw) }),
      sub: t("stats.planned", { mw: format.number(plannedMw) }),
    },
    {
      label: t("stats.top3Share"),
      value: format.number(top3Pct, { style: "percent" }),
      sub: t("stats.top3Sub"),
    },
    {
      label: t("stats.supplierLinks"),
      value: format.number(dash.supplierTotals.linkCount),
      sub: t("stats.companies", {
        count: format.number(dash.supplierTotals.supplierCount),
      }),
    },
  ];

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <nav className="text-xs">
        <Link
          href="/investigations"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 hover:underline"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          {t("backLink")}
        </Link>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            {t("title")}
          </h1>
          <MissionDialog />
        </div>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          {t("lead")}
        </p>
      </header>

      <dl
        aria-label={t("stats.label")}
        className="border-border bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border md:grid-cols-4"
      >
        {headline.map((s) => (
          <div key={s.label} className="bg-background flex flex-col p-4">
            <dt className="text-muted-foreground text-sm">{s.label}</dt>
            <dd className="mt-1 font-mono text-2xl font-semibold tracking-tight tabular-nums">
              {s.value}
            </dd>
            {s.sub && (
              <dd className="text-muted-foreground mt-0.5 text-xs">{s.sub}</dd>
            )}
          </div>
        ))}
      </dl>

      <div className="flex flex-col">
        <RouteTabs
          aria-label={t("tabsLabel")}
          tabs={DATACENTER_TABS.map((tab) => ({
            href: datacenterTabPath(tab.segment),
            label: t(`tabs.${tab.key}`),
            match: tab.segment ? "prefix" : "exact",
          }))}
        />
        <div className="pt-6">{children}</div>
      </div>
    </main>
  );
}
