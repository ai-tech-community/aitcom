import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/server";
import { ConcentrationPanel } from "@/components/datacenters/concentration-panel";
import { DashboardSection } from "@/components/datacenters/dashboard-section";
import { RelationshipGraphLoader } from "@/components/datacenters/relationship-graph-loader";
import { cn } from "@/lib/utils";
import { getInvestigationStats } from "@/server/datacenters/dashboard-data";
import { datacenterTabMetadata } from "@/server/datacenters/tab-metadata";

export const revalidate = 300;

export function generateMetadata() {
  return datacenterTabMetadata("marketPower");
}

const TOP_ROWS = 7;

export default async function DatacenterMarketPowerPage() {
  const [t, format, dash, graph] = await Promise.all([
    getTranslations("datacenterInvestigation.marketPower"),
    getFormatter(),
    getInvestigationStats(),
    api.datacenters.relationshipGraph({ minFacilities: 2 }),
  ]);
  const mw = (n: number) => format.number(Math.round(n));

  return (
    <div className="flex flex-col gap-10">
      <DashboardSection title={t("concentration")}>
        <ConcentrationPanel
          data={dash.concentration as never}
          breakdown={dash.concentrationBreakdown as never}
          dependency={dash.singleSupplierDep as never}
        />
      </DashboardSection>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-6">
        <DashboardSection
          title={t("topOperators")}
          hint={t("topOperatorsHint")}
          framed
        >
          <RankTable
            caption={t("topOperators")}
            columns={[t("operator"), t("sites"), t("mw"), t("planned")]}
            secondaryLastColumn
            rows={dash.topOperators.slice(0, TOP_ROWS).map((o) => ({
              key: o.slug,
              href: `/investigations/operators/${o.slug}`,
              name: o.canonicalName,
              values: [format.number(o.count), mw(o.mw), mw(o.plannedMw)],
            }))}
          />
        </DashboardSection>

        <DashboardSection
          title={t("topSuppliers")}
          hint={t("topSuppliersHint")}
          framed
        >
          <RankTable
            caption={t("topSuppliers")}
            columns={[t("supplier"), t("facilities"), t("categories")]}
            rows={dash.topSuppliers.slice(0, TOP_ROWS).map((s) => ({
              key: s.slug,
              href: `/investigations/suppliers/${s.slug}`,
              name: s.canonicalName,
              values: [
                format.number(s.facilities),
                format.number(s.categoryCount),
              ],
            }))}
          />
        </DashboardSection>
      </div>

      <DashboardSection title={t("graph")} hint={t("graphHint")}>
        <RelationshipGraphLoader
          nodes={graph.nodes as never}
          edges={graph.edges}
        />
      </DashboardSection>
    </div>
  );
}

/** Compact ranking: a linked name column followed by right-aligned numbers. */
function RankTable({
  caption,
  columns,
  rows,
  secondaryLastColumn = false,
}: {
  caption: string;
  columns: string[];
  rows: { key: string; href: string; name: string; values: string[] }[];
  /** Mute the last number when it is a projection (planned MW) rather than a fact. */
  secondaryLastColumn?: boolean;
}) {
  const [nameColumn, ...valueColumns] = columns;
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="text-muted-foreground text-xs">
        <tr>
          <th scope="col" className="pb-2 text-left font-medium">
            {nameColumn}
          </th>
          {valueColumns.map((c) => (
            <th key={c} scope="col" className="pb-2 text-right font-medium">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.key}
            className="border-border hover:bg-muted/40 border-t transition-colors"
          >
            <th scope="row" className="py-2 pr-3 text-left font-normal">
              <Link href={row.href} className="hover:underline">
                {row.name}
              </Link>
            </th>
            {row.values.map((v, i) => (
              <td
                key={i}
                className={cn(
                  "py-2 pl-3 text-right font-mono tabular-nums",
                  secondaryLastColumn &&
                    i === row.values.length - 1 &&
                    "text-muted-foreground",
                )}
              >
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
