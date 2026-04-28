"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConcentrationRow = {
  country: string;
  total_mw: number;
  operator_count: number;
  hhi: number;
  top3_share: number;
};

type BreakdownRow = {
  country: string;
  operator_slug: string;
  operator_name: string;
  mw: number;
  share_pct: number;
};

type DepRow = {
  datacenter_slug: string;
  datacenter_name: string;
  supplier_slug: string;
  supplier_name: string;
  categories: number;
  category_list: string[];
};

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

function hhiBand(hhi: number): {
  label: string;
  color: string;
  meaning: string;
} {
  if (hhi >= 2500)
    return {
      label: "highly concentrated",
      color: "bg-red-600",
      meaning: "One or few operators dominate. Limited choice for landowners, utilities, and policymakers.",
    };
  if (hhi >= 1500)
    return {
      label: "moderately concentrated",
      color: "bg-amber-500",
      meaning: "A handful of operators hold most capacity. Watch for further consolidation.",
    };
  return {
    label: "competitive",
    color: "bg-green-600",
    meaning: "Capacity spread across many operators. Healthy market structure.",
  };
}

function hhiPlainEnglish(hhi: number, opCount: number): string {
  if (hhi >= 9000)
    return `Effectively a monopoly — one operator holds nearly all tracked MW${opCount > 1 ? ` despite ${opCount} operators in the data` : ""}.`;
  if (hhi >= 5000)
    return "One operator dominates with a commanding share of capacity.";
  if (hhi >= 2500)
    return "Top operators hold so much share that a single deal could shift the market.";
  if (hhi >= 1500)
    return "A small group of operators control most capacity.";
  return "Capacity is spread across enough operators that no single one sets the market.";
}

export function ConcentrationPanel({
  data,
  breakdown,
  dependency,
}: {
  data: ConcentrationRow[];
  breakdown: BreakdownRow[];
  dependency: DepRow[];
}) {
  const [activeCountry, setActiveCountry] = useState<ConcentrationRow | null>(
    null,
  );
  const [activeDep, setActiveDep] = useState<DepRow | null>(null);

  const breakdownFor = (country: string) =>
    breakdown
      .filter((b) => b.country === country)
      .sort((a, b) => b.mw - a.mw);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="border-border rounded-lg border p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Operator concentration by country
          </h3>
          <span className="text-muted-foreground text-[10px]">
            click a row to see operators + HHI explained
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-xs uppercase tracking-wider">
            <tr>
              <th className="pb-2 text-left">Country</th>
              <th className="pb-2 text-right">Operators</th>
              <th className="pb-2 text-right">Top-3 %</th>
              <th className="pb-2 text-right">HHI</th>
              <th className="pb-2 text-left pl-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 12).map((r) => {
              const band = hhiBand(r.hhi);
              return (
                <tr
                  key={r.country}
                  onClick={() => setActiveCountry(r)}
                  className="border-border hover:bg-muted/40 cursor-pointer border-t transition"
                >
                  <td className="py-1.5 font-medium">{r.country}</td>
                  <td className="text-right">{r.operator_count}</td>
                  <td className="text-right">{r.top3_share}%</td>
                  <td className="text-right">{Math.round(r.hhi)}</td>
                  <td className="pl-3">
                    <span
                      className={`inline-block rounded ${band.color} px-1.5 py-0.5 text-[10px] text-white`}
                    >
                      {band.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-muted-foreground/70 mt-3 text-[10px]">
          HHI bands: &lt;1500 competitive, 1500–2500 moderate, ≥2500 high. US
          DOJ thresholds.
        </p>
      </div>

      <div className="border-border rounded-lg border p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Single-supplier dependency
          </h3>
          <span className="text-muted-foreground text-[10px]">
            click to see which categories
          </span>
        </div>
        {dependency.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No facilities meet the dependency threshold yet.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {dependency.slice(0, 12).map((d, i) => (
              <li key={i} className="border-b last:border-0">
                <button
                  type="button"
                  onClick={() => setActiveDep(d)}
                  className="hover:bg-muted/40 -mx-2 flex w-full items-start justify-between gap-2 rounded px-2 py-1.5 text-left transition"
                >
                  <div className="flex-1">
                    <div className="font-medium">{d.datacenter_name}</div>
                    <div className="text-muted-foreground text-xs">
                      {d.supplier_name} —{" "}
                      <span className="text-amber-600">
                        {d.categories} categories
                      </span>
                    </div>
                  </div>
                  <span className="text-muted-foreground text-xs">→</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground/70 mt-3 text-[10px]">
          Facilities where one supplier serves 3+ categories — potential
          single-point dependency.
        </p>
      </div>

      <Dialog
        open={activeCountry !== null}
        onOpenChange={(o) => !o && setActiveCountry(null)}
      >
        <DialogContent className="max-w-xl">
          {activeCountry && (
            <ConcentrationDetail
              row={activeCountry}
              operators={breakdownFor(activeCountry.country)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeDep !== null}
        onOpenChange={(o) => !o && setActiveDep(null)}
      >
        <DialogContent className="max-w-xl">
          {activeDep && <DependencyDetail row={activeDep} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConcentrationDetail({
  row,
  operators,
}: {
  row: ConcentrationRow;
  operators: BreakdownRow[];
}) {
  const band = hhiBand(row.hhi);
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span>{row.country}</span>
          <span
            className={`inline-block rounded ${band.color} px-1.5 py-0.5 text-[10px] text-white`}
          >
            {band.label}
          </span>
        </DialogTitle>
        <DialogDescription>
          {row.operator_count} operator{row.operator_count === 1 ? "" : "s"}
          {" · "}
          {Math.round(row.total_mw).toLocaleString()} MW tracked
          {" · "}
          HHI {Math.round(row.hhi)}
          {" · "}
          top-3 hold {row.top3_share}%
        </DialogDescription>
      </DialogHeader>

      <div className="border-border bg-muted/30 rounded-lg border p-3 text-xs leading-relaxed">
        <p className="font-medium">What HHI means here</p>
        <p className="text-muted-foreground mt-1">
          {hhiPlainEnglish(row.hhi, row.operator_count)} {band.meaning}
        </p>
        <p className="text-muted-foreground/80 mt-2">
          HHI = sum of squared market shares × 10,000. A value of 10,000 means
          one operator owns 100% of tracked MW. Below 1,500 is considered
          competitive by US DOJ.
        </p>
      </div>

      <div>
        <p className="text-muted-foreground mb-2 text-xs uppercase tracking-wider">
          Operators in {row.country}
        </p>
        <ul className="flex flex-col gap-1.5">
          {operators.map((o) => (
            <li
              key={o.operator_slug}
              className="border-border flex items-center justify-between gap-3 rounded border p-2 text-sm"
            >
              <Link
                href={`/investigations/datacenters?operator=${o.operator_slug}&country=${row.country}`}
                className="flex-1 font-medium hover:underline"
              >
                {o.operator_name}
              </Link>
              <span className="text-muted-foreground text-xs">
                {Math.round(o.mw).toLocaleString()} MW
              </span>
              <div className="bg-muted h-2 w-24 overflow-hidden rounded">
                <div
                  className="bg-primary h-full"
                  style={{ width: `${Math.min(100, o.share_pct)}%` }}
                />
              </div>
              <span className="w-12 text-right text-xs font-medium">
                {o.share_pct}%
              </span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground/70 mt-3 text-[10px]">
          Click an operator to see their facilities in {row.country}.
        </p>
      </div>

      <div className="border-t pt-3">
        <Link
          href={`/investigations/datacenters?country=${row.country}`}
          className="text-primary text-sm hover:underline"
        >
          See all {row.country} facilities →
        </Link>
      </div>
    </>
  );
}

function DependencyDetail({ row }: { row: DepRow }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{row.datacenter_name}</DialogTitle>
        <DialogDescription>
          {row.supplier_name} covers{" "}
          <span className="text-amber-600 font-medium">
            {row.categories} categories
          </span>{" "}
          at this facility
        </DialogDescription>
      </DialogHeader>

      <div className="border-border bg-muted/30 rounded-lg border p-3 text-xs leading-relaxed">
        <p className="font-medium">Why this gets flagged</p>
        <p className="text-muted-foreground mt-1">
          When one supplier serves 3+ categories at the same facility, a single
          contract dispute, bankruptcy, or supply-chain shock can stop the
          whole site. Diversified suppliers reduce single-point failure risk.
        </p>
      </div>

      <div>
        <p className="text-muted-foreground mb-2 text-xs uppercase tracking-wider">
          Categories handled by {row.supplier_name}
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {row.category_list.map((c) => (
            <li
              key={c}
              className="border-border bg-muted/40 rounded border px-2 py-1 text-xs"
            >
              {CATEGORY_LABEL[c] ?? c}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between border-t pt-3 text-sm">
        <Link
          href={`/investigations/datacenters/${row.datacenter_slug}`}
          className="text-primary hover:underline"
        >
          Open facility →
        </Link>
        <Link
          href={`/investigations/datacenters?supplier=${row.supplier_slug}`}
          className="text-muted-foreground hover:underline"
        >
          All {row.supplier_name} sites →
        </Link>
      </div>
    </>
  );
}
