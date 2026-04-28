type PeerData = {
  country: string;
  peerCount: number;
  thisFacility: {
    mw: number;
    lagDays: number | null;
    supplierCount: number;
    aiDedicated: boolean;
  };
  countryStats: {
    medianMw: number;
    p75Mw: number;
    p95Mw: number;
    medianLagDays: number | null;
    aiSharePct: number;
    medianSuppliers: number;
    p75Suppliers: number;
  };
};

function bandLabel(
  this_: number,
  median: number,
): { label: string; tone: string } {
  if (median === 0) return { label: "no peers", tone: "text-muted-foreground" };
  const ratio = this_ / median;
  if (ratio >= 5) return { label: "5×+ above median", tone: "text-red-600" };
  if (ratio >= 2) return { label: "2×+ above median", tone: "text-amber-600" };
  if (ratio >= 1.25) return { label: "above median", tone: "text-sky-600" };
  if (ratio >= 0.75)
    return { label: "near median", tone: "text-muted-foreground" };
  return { label: "below median", tone: "text-muted-foreground" };
}

export function PeerComparison({ data }: { data: PeerData }) {
  if (data.peerCount === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No peer facilities in {data.country} to compare against.
      </p>
    );
  }

  const mwBand = bandLabel(data.thisFacility.mw, data.countryStats.medianMw);
  const supBand = bandLabel(
    data.thisFacility.supplierCount,
    data.countryStats.medianSuppliers,
  );

  return (
    <div>
      <p className="text-muted-foreground mb-3 text-xs">
        Compared with {data.peerCount} peer facilities in{" "}
        <span className="font-medium">{data.country}</span>.
      </p>
      <dl className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Row
          label="Capacity (MW)"
          thisValue={`${Math.round(data.thisFacility.mw).toLocaleString()}`}
          peerValue={`median ${Math.round(data.countryStats.medianMw).toLocaleString()} · p95 ${Math.round(data.countryStats.p95Mw).toLocaleString()}`}
          band={mwBand}
        />
        <Row
          label="Supplier coverage"
          thisValue={`${data.thisFacility.supplierCount}`}
          peerValue={`median ${data.countryStats.medianSuppliers} · p75 ${data.countryStats.p75Suppliers}`}
          band={supBand}
        />
        <Row
          label="Announce → online lag"
          thisValue={
            data.thisFacility.lagDays != null
              ? `${Math.round((data.thisFacility.lagDays / 365) * 10) / 10}y`
              : "in progress"
          }
          peerValue={
            data.countryStats.medianLagDays != null
              ? `country median ${Math.round((data.countryStats.medianLagDays / 365) * 10) / 10}y`
              : "no completions yet"
          }
          band={null}
        />
      </dl>
      <p className="text-muted-foreground/70 mt-3 text-[10px]">
        Bands describe deviation from peer median; not a judgment.
      </p>
    </div>
  );
}

function Row({
  label,
  thisValue,
  peerValue,
  band,
}: {
  label: string;
  thisValue: string;
  peerValue: string;
  band: { label: string; tone: string } | null;
}) {
  return (
    <div className="border-border rounded border p-3">
      <dt className="text-muted-foreground text-xs tracking-wider uppercase">
        {label}
      </dt>
      <dd className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold">{thisValue}</span>
        {band && <span className={`text-xs ${band.tone}`}>{band.label}</span>}
      </dd>
      <dd className="text-muted-foreground mt-0.5 text-xs">{peerValue}</dd>
    </div>
  );
}
