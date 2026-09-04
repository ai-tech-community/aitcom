import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { api } from "@/trpc/server";
import { Link } from "@/i18n/navigation";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  gc: "General contractor",
  civil: "Civil / site work",
  electrical: "Electrical",
  transformer: "Transformers / switchgear",
  "backup-power": "Generators / UPS",
  cooling: "Cooling / HVAC",
  fiber: "Networking / fiber",
  hardware: "GPU / hardware",
  security: "Security",
  staffing: "Staffing / operations",
  other: "Other",
};

const STATUS_COLOR: Record<string, string> = {
  operational: "bg-green-600",
  "under-construction": "bg-amber-500",
  announced: "bg-sky-600",
  cancelled: "bg-muted-foreground",
  decommissioned: "bg-muted-foreground",
};

const POWER_LABEL: Record<string, string> = {
  solar: "Solar",
  wind: "Wind",
  hydro: "Hydro",
  geothermal: "Geothermal",
  nuclear: "Nuclear",
  gas: "Natural gas",
  coal: "Coal",
  grid: "Grid (mixed)",
  diesel: "Diesel",
  unknown: "Undisclosed",
};

const CARBON_FREE = new Set([
  "solar",
  "wind",
  "hydro",
  "geothermal",
  "nuclear",
]);

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const data = await api.datacenters.operatorBySlug({ slug });
    const title = `${data.brand.canonicalName} — Operator`;
    const desc = `${data.brand.canonicalName} operates ${data.totals.facilityCount} AI datacenter${data.totals.facilityCount === 1 ? "" : "s"} across ${data.totals.countryCount} countr${data.totals.countryCount === 1 ? "y" : "ies"} totalling ${Math.round(data.totals.totalMw + data.totals.plannedMw).toLocaleString()} MW.`;
    return {
      title,
      description: desc,
      ...buildOgMeta(title, desc, "Operator"),
      alternates: await localeAlternates(`/investigations/operators/${slug}`),
    };
  } catch {
    return { title: "Operator not found" };
  }
}

export default async function OperatorDetailPage({ params }: PageProps) {
  const { slug } = await params;
  let data;
  try {
    data = await api.datacenters.operatorBySlug({ slug });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  const {
    brand,
    facilities,
    suppliers,
    deals,
    totals,
    countryBreakdown,
    statusBreakdown,
    powerMix,
    categoryBreakdown,
  } = data;

  const totalCap = totals.totalMw + totals.plannedMw;
  const commitmentGap =
    brand.commitmentRenewablePct != null
      ? Math.round(
          (Number(brand.commitmentRenewablePct) - totals.carbonFreePct) * 10,
        ) / 10
      : null;

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <nav className="text-muted-foreground text-xs">
        <Link href="/investigations/datacenters" className="hover:underline">
          ← Datacenter dashboard
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {brand.canonicalName}
          </h1>
          {brand.verified && (
            <span className="rounded bg-green-600 px-1.5 py-0.5 text-xs text-white">
              verified
            </span>
          )}
          <span className="text-muted-foreground text-sm">· operator</span>
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
          {brand.website && (
            <a
              href={brand.website}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {new URL(brand.website).hostname} ↗
            </a>
          )}
          {brand.jurisdiction && (
            <span>jurisdiction: {brand.jurisdiction}</span>
          )}
          {brand.entityType && <span>type: {brand.entityType}</span>}
          {brand.ultimateBeneficialOwner && (
            <span>UBO: {brand.ultimateBeneficialOwner}</span>
          )}
        </div>
        {brand.aliases.length > 0 && (
          <p className="text-muted-foreground/80 text-xs">
            Also known as: {brand.aliases.join(", ")}
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Facilities" value={totals.facilityCount} />
        <StatCard
          label="Total capacity"
          value={`${Math.round(totalCap).toLocaleString()} MW`}
          sub={`${Math.round(totals.totalMw).toLocaleString()} live · +${Math.round(totals.plannedMw).toLocaleString()} planned`}
        />
        <StatCard label="Countries" value={totals.countryCount} />
        <StatCard label="Suppliers used" value={totals.supplierCount} />
        <StatCard label="Energy deals" value={totals.dealsCount} />
      </section>

      {brand.commitmentRenewablePct != null && (
        <section className="border-border rounded-lg border p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Commitment vs. actual
            </h2>
            {brand.commitmentSourceUrl && (
              <a
                href={brand.commitmentSourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground text-xs hover:underline"
              >
                source ↗
              </a>
            )}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-xs tracking-wider uppercase">
                Public commitment
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {brand.commitmentRenewablePct}%
                {brand.commitmentTargetYear && (
                  <span className="text-muted-foreground ml-1.5 text-sm font-normal">
                    by {brand.commitmentTargetYear}
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs tracking-wider uppercase">
                Actual carbon-free
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {totals.carbonFreePct}%
              </p>
              <p className="text-muted-foreground/70 text-xs">
                {Math.round(totals.carbonFreeMw).toLocaleString()} MW solar /
                wind / hydro / geo / nuclear
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs tracking-wider uppercase">
                Gap
              </p>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  commitmentGap != null && commitmentGap > 30
                    ? "text-red-600"
                    : commitmentGap != null && commitmentGap > 5
                      ? "text-amber-600"
                      : "text-green-600"
                }`}
              >
                {commitmentGap != null
                  ? commitmentGap > 0
                    ? `+${commitmentGap}pp`
                    : `${commitmentGap}pp`
                  : "—"}
              </p>
              <p className="text-muted-foreground/70 text-xs">
                {commitmentGap != null && commitmentGap > 30
                  ? "wide gap — claim far ahead of facility data"
                  : commitmentGap != null && commitmentGap > 5
                    ? "behind schedule"
                    : "on track or exceeding"}
              </p>
            </div>
          </div>
          {brand.commitmentNotes && (
            <p className="text-muted-foreground/80 mt-3 text-xs">
              {brand.commitmentNotes}
            </p>
          )}
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Country reach" hint="where they build">
          {countryBreakdown.length === 0 ? (
            <Empty />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {countryBreakdown.map((c) => (
                <li
                  key={c.country}
                  className="flex items-center justify-between text-sm"
                >
                  <Link
                    href={`/investigations/datacenters?country=${c.country}&operator=${slug}`}
                    className="hover:underline"
                  >
                    {c.country}
                  </Link>
                  <span className="text-muted-foreground tabular-nums">
                    {c.count} facilit{c.count === 1 ? "y" : "ies"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Status mix" hint="lifecycle of portfolio">
          {statusBreakdown.length === 0 ? (
            <Empty />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {statusBreakdown.map((s) => (
                <li
                  key={s.status}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${STATUS_COLOR[s.status] ?? "bg-muted"}`}
                    />
                    {s.status}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {s.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Power mix" hint="carbon-free vs fossil">
          {powerMix.length === 0 ? (
            <Empty />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {powerMix.map((p) => {
                const pct = totalCap > 0 ? (p.mw / totalCap) * 100 : 0;
                const cf = CARBON_FREE.has(p.source);
                return (
                  <li
                    key={p.source}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${cf ? "bg-green-600" : p.source === "unknown" ? "bg-muted-foreground" : "bg-amber-600"}`}
                      />
                      {POWER_LABEL[p.source] ?? p.source}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {Math.round(p.mw).toLocaleString()} MW · {pct.toFixed(0)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Suppliers used
          <span className="text-muted-foreground ml-2 text-sm font-normal">
            {suppliers.length}
          </span>
        </h2>
        {suppliers.length === 0 ? (
          <Empty />
        ) : (
          <div className="border-border overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs tracking-wider uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Supplier</th>
                  <th className="px-3 py-2 text-right">Facilities</th>
                  <th className="px-3 py-2 text-right">Categories</th>
                  <th className="px-3 py-2 text-left">What</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.slice(0, 30).map((s) => (
                  <tr
                    key={s.slug}
                    className="border-border hover:bg-muted/40 border-t transition"
                  >
                    <td className="px-3 py-1.5 font-medium">
                      <Link
                        href={`/investigations/suppliers/${s.slug}`}
                        className="hover:underline"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {s.facilityCount}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {s.categoryCount}
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 text-xs">
                      {s.categories
                        .map((c) => CATEGORY_LABEL[c] ?? c)
                        .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {categoryBreakdown.length > 0 && (
        <section className="border-border rounded-lg border p-4">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Supplier-category coverage
          </h2>
          <p className="text-muted-foreground/70 mt-1 text-xs">
            How many supplier links each category has across this
            operator&apos;s facilities.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {categoryBreakdown.map((c) => (
              <li
                key={c.category}
                className="border-border bg-muted/40 rounded border px-2 py-1 text-xs"
              >
                {CATEGORY_LABEL[c.category] ?? c.category}{" "}
                <span className="text-muted-foreground">· {c.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Facilities
          <span className="text-muted-foreground ml-2 text-sm font-normal">
            {facilities.length}
          </span>
        </h2>
        {facilities.length === 0 ? (
          <Empty />
        ) : (
          <div className="border-border overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs tracking-wider uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Facility</th>
                  <th className="px-3 py-2 text-left">Where</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Power</th>
                  <th className="px-3 py-2 text-right">MW</th>
                  <th className="px-3 py-2 text-right">Planned</th>
                </tr>
              </thead>
              <tbody>
                {facilities.map((f) => (
                  <tr
                    key={f.id}
                    className="border-border hover:bg-muted/40 border-t transition"
                  >
                    <td className="px-3 py-1.5 font-medium">
                      <Link
                        href={`/investigations/datacenters/${f.slug}`}
                        className="hover:underline"
                      >
                        {f.name}
                      </Link>
                      {f.aiDedicated && (
                        <span className="ml-1.5 rounded bg-purple-600 px-1 py-0.5 text-xs text-white">
                          AI
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 text-xs">
                      {[f.city, f.region, f.country].filter(Boolean).join(", ")}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs text-white ${STATUS_COLOR[f.status] ?? "bg-muted"}`}
                      >
                        {f.status}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 text-xs">
                      {f.primaryPowerSource
                        ? (POWER_LABEL[f.primaryPowerSource] ??
                          f.primaryPowerSource)
                        : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {f.capacityMw != null
                        ? Number(f.capacityMw).toLocaleString()
                        : "—"}
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 text-right text-xs tabular-nums">
                      {f.capacityMwPlanned != null
                        ? Number(f.capacityMwPlanned).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {deals.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">
            Energy deals
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {deals.length}
            </span>
          </h2>
          <div className="border-border overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs tracking-wider uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Counterparty</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">MW</th>
                  <th className="px-3 py-2 text-left">Signed</th>
                  <th className="px-3 py-2 text-left">Term</th>
                  <th className="px-3 py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.deal.id} className="border-border border-t">
                    <td className="px-3 py-1.5 font-medium">{d.deal.title}</td>
                    <td className="px-3 py-1.5">
                      <Link
                        href={`/investigations/operators/${d.counterparty.slug}`}
                        className="hover:underline"
                      >
                        {d.counterparty.canonicalName}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 text-xs">
                      {d.deal.type}
                      {d.deal.energyType && (
                        <span className="text-muted-foreground/70 ml-1">
                          · {d.deal.energyType}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {d.deal.mw != null
                        ? Number(d.deal.mw).toLocaleString()
                        : "—"}
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 text-xs">
                      {d.deal.signedDate
                        ? new Date(d.deal.signedDate).getFullYear()
                        : "—"}
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 text-xs">
                      {d.deal.termYears ? `${d.deal.termYears}y` : "—"}
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 text-right text-xs tabular-nums">
                      {d.deal.valueUsd != null
                        ? `$${(Number(d.deal.valueUsd) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
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
        <div className="text-muted-foreground/70 mt-0.5 text-xs">{sub}</div>
      )}
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border rounded-lg border p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {title}
        </h3>
        {hint && (
          <span className="text-muted-foreground/70 text-xs">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <p className="text-muted-foreground py-4 text-center text-sm">
      No data yet.
    </p>
  );
}
