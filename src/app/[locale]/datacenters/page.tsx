import type { Metadata } from "next";
import { api } from "@/trpc/server";
import { Link } from "@/i18n/navigation";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import {
  DatacentersMap,
  type MapDatacenter,
} from "@/components/datacenters-map";

export const metadata: Metadata = {
  title: "AI Datacenters",
  description:
    "Community-tracked AI datacenter ecosystem — locations, operators, capacity, power, water, suppliers.",
  ...buildOgMeta(
    "AI Datacenters",
    "Community-tracked AI datacenter ecosystem — locations, operators, capacity, power, water, suppliers.",
    "Datacenters",
  ),
  alternates: buildAlternates("/datacenters"),
};

export const revalidate = 300;

interface PageProps {
  searchParams: Promise<{
    country?: string;
    status?: string;
    ai?: string;
    unverified?: string;
  }>;
}

export default async function DatacentersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const aiOnly = sp.ai === "1";
  const includeUnverified = sp.unverified === "1";

  const [list, stats] = await Promise.all([
    api.datacenters.list({
      country: sp.country?.toUpperCase(),
      status: sp.status as never,
      aiOnly,
      includeUnverified,
      limit: 500,
    }),
    api.datacenters.stats(),
  ]);

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
    operator: {
      slug: d.operator.slug,
      canonicalName: d.operator.canonicalName,
    },
  }));

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
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
          label="Total capacity"
          value={`${Math.round(stats.totals.totalMw).toLocaleString()} MW`}
        />
        <StatCard
          label="Planned capacity"
          value={`${Math.round(stats.totals.plannedMw).toLocaleString()} MW`}
        />
        <StatCard label="Countries" value={stats.byCountry.length} />
      </section>

      <section className="flex flex-wrap gap-2 text-xs">
        <FilterLink
          label="All"
          active={!aiOnly && !sp.status}
          href="/datacenters"
        />
        <FilterLink
          label="AI only"
          active={aiOnly}
          href={`/datacenters?${new URLSearchParams({ ...sp, ai: aiOnly ? "" : "1" } as Record<string, string>).toString()}`}
        />
        {(["operational", "under-construction", "announced"] as const).map(
          (s) => (
            <FilterLink
              key={s}
              label={s}
              active={sp.status === s}
              href={`/datacenters?${new URLSearchParams({ ...sp, status: sp.status === s ? "" : s } as Record<string, string>).toString()}`}
            />
          ),
        )}
        <FilterLink
          label="include unverified"
          active={includeUnverified}
          href={`/datacenters?${new URLSearchParams({ ...sp, unverified: includeUnverified ? "" : "1" } as Record<string, string>).toString()}`}
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
              href={`/datacenters/${d.slug}`}
              className="border-border hover:bg-muted/30 flex flex-col gap-1 rounded-lg border p-4 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{d.name}</span>
                {d.aiDedicated && (
                  <span className="rounded bg-purple-600 px-1.5 py-0.5 text-xs text-white">
                    AI
                  </span>
                )}
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
