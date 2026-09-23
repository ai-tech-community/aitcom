import {
  LIVE_INVESTIGATION_PATH,
  METHOD_PATH,
} from "@/lib/investigations/datacenter-flag-method";

/**
 * The AI Datacenters investigation is split into tabs. Each tab is a real route
 * (shareable, back-button friendly, loads only its own data) under
 * `LIVE_INVESTIGATION_PATH`, rendered by the `(dashboard)` route group.
 *
 * Facilities is the index route so existing filter links such as
 * `/investigations/datacenters?operator=x&country=US` keep landing on the table.
 */
export const DATACENTER_TABS = [
  { key: "facilities", segment: "" },
  { key: "redFlags", segment: "red-flags" },
  { key: "marketPower", segment: "market-power" },
  { key: "energyGrowth", segment: "energy-growth" },
] as const;

export type DatacenterTabKey = (typeof DATACENTER_TABS)[number]["key"];

export function datacenterTabPath(segment: string): string {
  return segment
    ? `${LIVE_INVESTIGATION_PATH}/${segment}`
    : LIVE_INVESTIGATION_PATH;
}

/**
 * Static child routes of `/investigations/datacenters` shadow the `[slug]`
 * detail route, so no facility may use one of these as its slug.
 */
export const RESERVED_DATACENTER_SLUGS: ReadonlySet<string> = new Set([
  METHOD_PATH.slice(LIVE_INVESTIGATION_PATH.length + 1),
  ...DATACENTER_TABS.map((tab) => tab.segment).filter(Boolean),
]);

export function isReservedDatacenterSlug(slug: string): boolean {
  return RESERVED_DATACENTER_SLUGS.has(slug);
}
