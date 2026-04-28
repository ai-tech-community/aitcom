import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { api } from "@/trpc/server";
import { Link } from "@/i18n/navigation";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";

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

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const data = await api.datacenters.supplierBySlug({ slug });
    const title = `${data.brand.canonicalName} — Supplier`;
    const desc = `${data.brand.canonicalName} supplies ${data.totals.facilityCount} AI datacenter${data.totals.facilityCount === 1 ? "" : "s"} across ${data.totals.countryCount} countr${data.totals.countryCount === 1 ? "y" : "ies"}, covering ${data.totals.categoryCount} categor${data.totals.categoryCount === 1 ? "y" : "ies"}.`;
    return {
      title,
      description: desc,
      ...buildOgMeta(title, desc, "Supplier"),
      alternates: buildAlternates(`/investigations/suppliers/${slug}`),
    };
  } catch {
    return { title: "Supplier not found" };
  }
}

export default async function SupplierDetailPage({ params }: PageProps) {
  const { slug } = await params;
  let data;
  try {
    data = await api.datacenters.supplierBySlug({ slug });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  const {
    brand,
    facilities,
    totals,
    categoryBreakdown,
    countryBreakdown,
    operatorBreakdown,
  } = data;

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
            <span className="rounded bg-green-600 px-1.5 py-0.5 text-[10px] text-white">
              verified
            </span>
          )}
          <span className="text-muted-foreground text-sm">· supplier</span>
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
        <StatCard label="Operators served" value={totals.operatorCount} />
        <StatCard label="Countries" value={totals.countryCount} />
        <StatCard label="Categories" value={totals.categoryCount} />
        <StatCard
          label="Verified links"
          value={`${totals.verifiedLinks}/${totals.facilityCount}`}
        />
      </section>

      {totals.contractValueUsd > 0 && (
        <section className="border-border bg-muted/20 rounded-lg border p-4">
          <p className="text-muted-foreground text-xs tracking-wider uppercase">
            Disclosed contract value
          </p>
          <p className="mt-1 text-2xl font-semibold">
            $
            {(totals.contractValueUsd / 1_000_000).toLocaleString(undefined, {
              maximumFractionDigits: 1,
            })}
            M
          </p>
          <p className="text-muted-foreground/70 mt-1 text-xs">
            Sum of disclosed USD values across linked contracts. Many links have
            no disclosed value — actual total is higher.
          </p>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Category coverage" hint="what they actually do">
          {categoryBreakdown.length === 0 ? (
            <Empty />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {categoryBreakdown.map((c) => (
                <li
                  key={c.category}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{CATEGORY_LABEL[c.category] ?? c.category}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {c.count} facilit{c.count === 1 ? "y" : "ies"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Country reach" hint="where they operate">
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
                    href={`/investigations/datacenters?country=${c.country}&supplier=${slug}`}
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

        <Panel title="Operators served" hint="customer concentration">
          {operatorBreakdown.length === 0 ? (
            <Empty />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {operatorBreakdown.slice(0, 12).map((o) => (
                <li
                  key={o.slug}
                  className="flex items-center justify-between text-sm"
                >
                  <Link
                    href={`/investigations/datacenters?operator=${o.slug}&supplier=${slug}`}
                    className="truncate pr-2 hover:underline"
                  >
                    {o.name}
                  </Link>
                  <span className="text-muted-foreground tabular-nums">
                    {o.count}×
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Facilities they supply
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
                  <th className="px-3 py-2 text-left">Operator</th>
                  <th className="px-3 py-2 text-left">Where</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">MW</th>
                  <th className="px-3 py-2 text-right">Contract</th>
                </tr>
              </thead>
              <tbody>
                {facilities.map((f) => (
                  <tr
                    key={f.link.id}
                    className="border-border hover:bg-muted/40 border-t transition"
                  >
                    <td className="px-3 py-1.5 font-medium">
                      <Link
                        href={`/investigations/datacenters/${f.datacenter.slug}`}
                        className="hover:underline"
                      >
                        {f.datacenter.name}
                      </Link>
                      {!f.link.verified && (
                        <span className="text-muted-foreground/70 ml-1.5 text-[10px]">
                          unverified link
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {f.operator ? (
                        <Link
                          href={`/investigations/datacenters?operator=${f.operator.slug}`}
                          className="hover:underline"
                        >
                          {f.operator.canonicalName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 text-xs">
                      {[
                        f.datacenter.city,
                        f.datacenter.region,
                        f.datacenter.country,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </td>
                    <td className="px-3 py-1.5">
                      {CATEGORY_LABEL[f.link.category] ?? f.link.category}
                      {f.link.role && (
                        <span className="text-muted-foreground/80 ml-1 text-xs">
                          · {f.link.role}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] text-white ${STATUS_COLOR[f.datacenter.status] ?? "bg-muted"}`}
                      >
                        {f.datacenter.status}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {f.datacenter.capacityMw != null
                        ? Number(f.datacenter.capacityMw).toLocaleString()
                        : "—"}
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 text-right text-xs tabular-nums">
                      {f.link.contractValueUsd != null
                        ? `$${(Number(f.link.contractValueUsd) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {brand.commitmentRenewablePct != null && (
        <section className="border-border rounded-lg border p-4">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Public commitments
          </h2>
          <p className="mt-2 text-sm">
            <strong>{brand.commitmentRenewablePct}%</strong> renewable
            {brand.commitmentTargetYear
              ? ` by ${brand.commitmentTargetYear}`
              : ""}
            {brand.commitmentSourceUrl && (
              <>
                {" — "}
                <a
                  href={brand.commitmentSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:underline"
                >
                  source ↗
                </a>
              </>
            )}
          </p>
          {brand.commitmentNotes && (
            <p className="text-muted-foreground/80 mt-2 text-xs">
              {brand.commitmentNotes}
            </p>
          )}
        </section>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-border rounded-lg border p-4">
      <div className="text-muted-foreground text-xs tracking-wider uppercase">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
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
          <span className="text-muted-foreground/70 text-[10px]">{hint}</span>
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
