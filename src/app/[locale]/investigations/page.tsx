import type { Metadata } from "next";
import { api } from "@/trpc/server";
import { Link } from "@/i18n/navigation";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { MissionDialog } from "@/components/datacenters/mission-dialog";

export const metadata: Metadata = {
  title: "Investigations",
  description:
    "Community-driven investigations into the AI economy — datacenter ecosystems, supply chains, energy deals, and the companies behind them.",
  ...buildOgMeta(
    "Investigations",
    "Community-driven investigations into the AI economy.",
    "Investigations",
  ),
  alternates: buildAlternates("/investigations"),
};

export const revalidate = 300;

export default async function InvestigationsPage() {
  const stats = await api.datacenters.investigationStats();

  return (
    <main className="container mx-auto flex flex-col gap-8 p-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Investigations
          </h1>
          <MissionDialog label="Why this matters" variant="outline" />
        </div>
        <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">
          Community research on the AI economy. Each investigation tracks
          facilities, companies, supply chains, and money flows behind the
          infrastructure that powers AI. Open data, sourced facts, member
          verification.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/investigations/datacenters"
          className="border-border hover:border-primary group flex flex-col gap-4 rounded-xl border p-6 transition"
        >
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold">AI Datacenters</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Locations, operators, capacity, power, water, suppliers, energy
                deals.
              </p>
            </div>
            <span className="text-muted-foreground group-hover:text-primary text-sm">
              →
            </span>
          </div>
          <dl className="grid grid-cols-3 gap-3 border-t pt-4 text-sm">
            <Stat
              label="Facilities"
              value={stats.totals.facilityCount.toLocaleString()}
            />
            <Stat
              label="Total MW"
              value={Math.round(
                stats.totals.totalMw + stats.totals.plannedMw,
              ).toLocaleString()}
            />
            <Stat label="Countries" value={stats.totals.countries} />
            <Stat label="AI-dedicated" value={stats.totals.aiDedicated} />
            <Stat
              label="Supplier links"
              value={stats.supplierTotals.linkCount}
            />
            <Stat
              label="Companies"
              value={stats.supplierTotals.supplierCount}
            />
          </dl>
        </Link>

        <div className="border-border bg-muted/20 flex flex-col items-start justify-center gap-2 rounded-xl border border-dashed p-6">
          <h2 className="text-muted-foreground text-xl font-semibold">
            More investigations coming
          </h2>
          <p className="text-muted-foreground text-sm">
            Energy deals · Compute supply chain · Water · Public funding ·
            Workforce.
          </p>
          <p className="text-muted-foreground/60 text-xs">
            Got a topic? Submit it via the community feed.
          </p>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs tracking-wider uppercase">
        {label}
      </dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
