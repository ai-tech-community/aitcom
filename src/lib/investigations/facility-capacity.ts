/**
 * Operating capacity and the separate build-out target on `app.datacenter`.
 *
 * `capacityMw` is megawatts already operating. `capacityMwPlanned` is the
 * planned total, not an increment to add on top. Adding the two double-counts:
 * a site recorded as 704 MW operating and 704 MW planned would display as
 * 1,408 MW, and Colossus Memphis (250 operating, 1,000 planned) would display
 * as 1,250 MW. Neither sum is a stored field.
 */
export type FacilityCapacity = {
  currentMw: number | null;
  plannedMw: number | null;
};

export function readFacilityCapacity(
  capacityMw: number | string | null | undefined,
  capacityMwPlanned: number | string | null | undefined,
): FacilityCapacity {
  return {
    currentMw: parseMw(capacityMw),
    plannedMw: parseMw(capacityMwPlanned),
  };
}

/** Peer bands compare operating megawatts, the same field as the facilities table. */
export function peerComparableMw(capacity: FacilityCapacity): number | null {
  return capacity.currentMw;
}

export function formatFacilityMw(mw: number | null, locale?: string): string {
  if (mw == null) return "—";
  return `${Math.round(mw).toLocaleString(locale)} MW`;
}

function parseMw(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}
