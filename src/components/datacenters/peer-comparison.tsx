import { formatFacilityMw } from "@/lib/investigations/facility-capacity";

type PeerData = {
  country: string;
  peerCount: number;
  thisFacility: {
    /** Operating MW (`capacityMw`). Null when the record does not state it. */
    currentMw: number | null;
    /** Build-out target (`capacityMwPlanned`). Not added to currentMw. */
    plannedMw: number | null;
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

  const mwBand =
    data.thisFacility.currentMw == null
      ? null
      : bandLabel(data.thisFacility.currentMw, data.countryStats.medianMw);
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
        <CapacityRow
          currentMw={data.thisFacility.currentMw}
          plannedMw={data.thisFacility.plannedMw}
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
      <p className="text-muted-foreground/70 mt-3 text-xs">
        Bands compare operating capacity with the peer median. Planned capacity
        is shown separately and is not added.
      </p>
    </div>
  );
}

function CapacityRow({
  currentMw,
  plannedMw,
  peerValue,
  band,
}: {
  currentMw: number | null;
  plannedMw: number | null;
  peerValue: string;
  band: { label: string; tone: string } | null;
}) {
  return (
    <div className="border-border rounded border p-3">
      <dt className="text-muted-foreground text-xs tracking-wider uppercase">
        Current capacity
      </dt>
      <dd className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold">
          {formatFacilityMw(currentMw)}
        </span>
        {band && <span className={`text-xs ${band.tone}`}>{band.label}</span>}
      </dd>
      <dd className="text-muted-foreground mt-0.5 text-xs">{peerValue}</dd>
      {plannedMw != null && (
        <>
          <dt className="text-muted-foreground mt-3 text-xs tracking-wider uppercase">
            Planned capacity
          </dt>
          <dd className="mt-1 text-lg font-semibold">
            {formatFacilityMw(plannedMw)}
          </dd>
        </>
      )}
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
