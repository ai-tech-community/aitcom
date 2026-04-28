import type { Metadata } from "next";
import { api } from "@/trpc/server";
import { Link } from "@/i18n/navigation";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import {
  DatacentersMap,
  type MapDatacenter,
} from "@/components/datacenters-map";
import {
  PowerSourcePie,
  CountryScatter,
  SupplierCategoryBar,
  OperatorPowerMixStack,
  AnnounceTrendChart,
} from "@/components/datacenters/investigation-charts";
import { ConcentrationPanel } from "@/components/datacenters/concentration-panel";
import { GreenwashPanel } from "@/components/datacenters/greenwash-panel";
import { RedFlagsPanel } from "@/components/datacenters/red-flags-panel";
import { RelationshipGraphLoader } from "@/components/datacenters/relationship-graph-loader";

export const metadata: Metadata = {
  title: "AI Datacenters",
  description:
    "Community-tracked AI datacenter ecosystem — locations, operators, capacity, power, water, suppliers.",
  ...buildOgMeta(
    "AI Datacenters",
    "Community-tracked AI datacenter ecosystem — locations, operators, capacity, power, water, suppliers.",
    "Datacenters",
  ),
  alternates: buildAlternates("/investigations/datacenters"),
};

export const revalidate = 300;

interface PageProps {
  searchParams: Promise<{
    country?: string;
    status?: string;
    ai?: string;
    unverified?: string;
    suppliers?: string;
  }>;
}

export default async function DatacentersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const aiOnly = sp.ai === "1";
  const includeUnverified = sp.unverified === "1";
  const withSuppliers = sp.suppliers === "1";

  const [list, stats, dash, graph, phase5] = await Promise.all([
    api.datacenters.list({
      country: sp.country?.toUpperCase(),
      status: sp.status as never,
      aiOnly,
      includeUnverified,
      withSuppliers,
      limit: 500,
    }),
    api.datacenters.stats(),
    api.datacenters.investigationStats(),
    api.datacenters.relationshipGraph({ minFacilities: 2 }),
    api.datacenters.phase5RedFlags(),
  ]);

  // Top-3 operator concentration globally (operators by total announced + planned MW)
  const top3Mw = dash.topOperators
    .slice(0, 3)
    .reduce((s, o) => s + o.mw + o.plannedMw, 0);
  const allOpMw = dash.topOperators.reduce(
    (s, o) => s + o.mw + o.plannedMw,
    0,
  );
  const top3Pct =
    allOpMw > 0 ? Math.round((top3Mw / allOpMw) * 100) : 0;

  const totalCapacityMw = Math.round(
    stats.totals.totalMw + stats.totals.plannedMw,
  );
  const plannedDelta = Math.round(stats.totals.plannedMw);

  const mapPoints: MapDatacenter[] = list.map((d) => ({
    id: d.id,
    slug: d.slug,
    name: d.name,
    status: d.status,
    aiDedicated: d.aiDedicated,
    lat: Number(d.lat),
    lng: Number(d.lng),
    city: d.city,
    region: d.region,
    country: d.country,
    capacityMw: d.capacityMw == null ? null : Number(d.capacityMw),
    capacityMwPlanned:
      d.capacityMwPlanned == null ? null : Number(d.capacityMwPlanned),
    primaryPowerSource: d.primaryPowerSource,
    coolingType: d.coolingType,
    verified: d.verified,
    supplierCount: d.supplierCount,
    operator: {
      slug: d.operator.slug,
      canonicalName: d.operator.canonicalName,
    },
  }));

  const withSupplierTotal = list.filter((d) => d.supplierCount > 0).length;

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <nav className="text-muted-foreground text-xs">
        <Link href="/investigations" className="hover:underline">
          ← All investigations
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          AI Datacenters
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Community research on the AI datacenter ecosystem — facilities,
          operators, capacity, power sources, water draw, suppliers, and energy
          deals. Add a facility you know about, verify what others submit.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Verified facilities" value={stats.totals.count} />
        <StatCard
          label="Capacity"
          value={`${totalCapacityMw.toLocaleString()} MW`}
          sub={`+${plannedDelta.toLocaleString()} MW planned`}
        />
        <StatCard
          label="Top-3 operator share"
          value={`${top3Pct}%`}
          sub="of tracked MW"
        />
        <StatCard
          label="Supplier links"
          value={dash.supplierTotals.linkCount}
          sub={`${dash.supplierTotals.supplierCount} companies`}
        />
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Anomalies that warrant review
          </h2>
          <span className="text-muted-foreground text-[10px]">
            descriptive flags · not editorial claims
          </span>
        </div>
        <RedFlagsPanel flags={dash.redFlags} phase5={phase5} />
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Greenwash gap
          </h2>
          <span className="text-muted-foreground text-[10px]">
            commitment vs. actual carbon-free MW
          </span>
        </div>
        <div className="border-border rounded-lg border p-4">
          <GreenwashPanel data={dash.greenwashGap as never} />
        </div>
      </section>

      <section>
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
          Concentration & dependency
        </h2>
        <ConcentrationPanel
          data={dash.concentration as never}
          dependency={dash.singleSupplierDep as never}
        />
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Operator ↔ supplier relationships
          </h2>
          <span className="text-muted-foreground text-[10px]">
            Bipartite graph · click nodes to focus
          </span>
        </div>
        <RelationshipGraphLoader
          nodes={graph.nodes as never}
          edges={graph.edges}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Top operators by capacity">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="pb-2 text-left">Operator</th>
                <th className="pb-2 text-right">Sites</th>
                <th className="pb-2 text-right">MW</th>
                <th className="pb-2 text-right">Planned</th>
              </tr>
            </thead>
            <tbody>
              {dash.topOperators.slice(0, 7).map((o) => (
                <tr key={o.slug} className="border-border border-t">
                  <td className="py-1.5">{o.canonicalName}</td>
                  <td className="text-right">{o.count}</td>
                  <td className="text-right">
                    {Math.round(o.mw).toLocaleString()}
                  </td>
                  <td className="text-muted-foreground text-right">
                    {Math.round(o.plannedMw).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>

        <ChartCard title="Top suppliers by facility coverage">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="pb-2 text-left">Supplier</th>
                <th className="pb-2 text-right">Facilities</th>
                <th className="pb-2 text-right">Categories</th>
              </tr>
            </thead>
            <tbody>
              {dash.topSuppliers.slice(0, 7).map((s) => (
                <tr key={s.slug} className="border-border border-t">
                  <td className="py-1.5">{s.canonicalName}</td>
                  <td className="text-right">{s.facilities}</td>
                  <td className="text-muted-foreground text-right">
                    {s.categoryCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>

        <ChartCard title="Power source mix">
          <PowerSourcePie data={dash.byPowerSource} />
        </ChartCard>

        <ChartCard title="Countries — facilities × MW">
          <CountryScatter data={stats.byCountry} />
        </ChartCard>

        <ChartCard title="Supplier categories" wide>
          <SupplierCategoryBar data={dash.topSupplierCategories} />
        </ChartCard>

        <ChartCard
          title="Power mix by top operator (MW, announced + planned)"
          wide
        >
          <OperatorPowerMixStack data={dash.operatorPowerMix} />
        </ChartCard>

        <ChartCard
          title={`Announcements vs. completions per year${
            dash.lagStats.sample_size > 0
              ? ` · median lag ${Math.round(dash.lagStats.median_lag_days / 365)}y (${dash.lagStats.sample_size} samples)`
              : ""
          }`}
          wide
        >
          <AnnounceTrendChart data={dash.announceTrend} />
        </ChartCard>
      </section>

      <section className="flex flex-wrap gap-2 text-xs">
        <FilterLink
          label="All"
          active={!aiOnly && !sp.status}
          href="/investigations/datacenters"
        />
        <FilterLink
          label="AI only"
          active={aiOnly}
          href={`/investigations/datacenters?${new URLSearchParams({ ...sp, ai: aiOnly ? "" : "1" } as Record<string, string>).toString()}`}
        />
        {(["operational", "under-construction", "announced"] as const).map(
          (s) => (
            <FilterLink
              key={s}
              label={s}
              active={sp.status === s}
              href={`/investigations/datacenters?${new URLSearchParams({ ...sp, status: sp.status === s ? "" : s } as Record<string, string>).toString()}`}
            />
          ),
        )}
        <FilterLink
          label={`with suppliers (${withSupplierTotal})`}
          active={withSuppliers}
          href={`/investigations/datacenters?${new URLSearchParams({ ...sp, suppliers: withSuppliers ? "" : "1" } as Record<string, string>).toString()}`}
        />
        <FilterLink
          label="include unverified"
          active={includeUnverified}
          href={`/investigations/datacenters?${new URLSearchParams({ ...sp, unverified: includeUnverified ? "" : "1" } as Record<string, string>).toString()}`}
        />
      </section>

      {mapPoints.length === 0 ? (
        <EmptyState includeUnverified={includeUnverified} />
      ) : (
        <DatacentersMap datacenters={mapPoints} />
      )}

      <section className="mt-2">
        <h2 className="mb-3 text-lg font-semibold">
          {list.length} {list.length === 1 ? "facility" : "facilities"}
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((d) => (
            <Link
              key={d.id}
              href={`/investigations/datacenters/${d.slug}`}
              className="border-border hover:bg-muted/30 flex flex-col gap-1 rounded-lg border p-4 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{d.name}</span>
                <div className="flex shrink-0 gap-1">
                  {d.aiDedicated && (
                    <span className="rounded bg-purple-600 px-1.5 py-0.5 text-xs text-white">
                      AI
                    </span>
                  )}
                  {d.supplierCount > 0 && (
                    <span className="rounded bg-sky-600 px-1.5 py-0.5 text-xs text-white">
                      {d.supplierCount}↘
                    </span>
                  )}
                </div>
              </div>
              <span className="text-muted-foreground text-xs">
                {d.operator.canonicalName} ·{" "}
                {[d.city, d.region, d.country].filter(Boolean).join(", ")}
              </span>
              <div className="text-muted-foreground mt-1 flex flex-wrap gap-1.5 text-xs">
                <span className="bg-muted rounded px-1.5 py-0.5">
                  {d.status}
                </span>
                {d.capacityMw != null && (
                  <span className="bg-muted rounded px-1.5 py-0.5">
                    {Number(d.capacityMw)} MW
                  </span>
                )}
                {d.primaryPowerSource && (
                  <span className="bg-muted rounded px-1.5 py-0.5">
                    {d.primaryPowerSource}
                  </span>
                )}
                {d.coolingType && (
                  <span className="bg-muted rounded px-1.5 py-0.5">
                    {d.coolingType}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="border-border rounded-lg border p-4">
      <div className="text-muted-foreground text-xs tracking-wider uppercase">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && (
        <div className="text-muted-foreground mt-0.5 text-xs">{sub}</div>
      )}
    </div>
  );
}

function ChartCard({
  title,
  children,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`border-border rounded-lg border p-4 ${wide ? "lg:col-span-2" : ""}`}
    >
      <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </div>
  );
}

function FilterLink({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 transition ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border hover:bg-muted/40"
      }`}
    >
      {label}
    </Link>
  );
}

function EmptyState({ includeUnverified }: { includeUnverified: boolean }) {
  return (
    <div className="border-border flex h-[40vh] flex-col items-center justify-center gap-2 rounded-xl border border-dashed">
      <p className="text-muted-foreground text-sm">
        No datacenters match these filters.
      </p>
      {!includeUnverified && (
        <p className="text-muted-foreground text-xs">
          Try toggling “include unverified” — community submissions appear here.
        </p>
      )}
    </div>
  );
}
