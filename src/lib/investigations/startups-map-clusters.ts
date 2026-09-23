import Supercluster from "supercluster";

import {
  STARTUP_PIN_ZOOM,
  type StartupMapPin,
} from "@/lib/investigations/startups";

/**
 * Deepest zoom the directory map allows. Pins are at best city-level, so
 * two steps past city zoom is the most detail that still means something.
 */
export const STARTUPS_MAP_MAX_ZOOM = STARTUP_PIN_ZOOM.city + 2;

export const STARTUPS_MAP_MIN_ZOOM = 1;

/** Cluster radius in screen pixels; sized for the count bubbles. */
const CLUSTER_RADIUS = 64;

export type StartupMapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type StartupMapMarker =
  | {
      kind: "cluster";
      id: number;
      lat: number;
      lng: number;
      count: number;
      /** Zoom at which this cluster splits apart. */
      expansionZoom: number;
      /** False when zooming in cannot split it (pins share one place). */
      expandable: boolean;
    }
  | { kind: "pin"; pin: StartupMapPin };

type PinProps = { pinIndex: number };

/**
 * Groups directory pins into count bubbles for a map viewport. Wraps
 * supercluster so the map component only deals in pins and markers.
 */
export class StartupClusterIndex {
  private readonly index: Supercluster<PinProps>;

  constructor(private readonly pins: readonly StartupMapPin[]) {
    this.index = new Supercluster<PinProps>({
      radius: CLUSTER_RADIUS,
      maxZoom: STARTUPS_MAP_MAX_ZOOM,
      minZoom: 0,
    });
    this.index.load(
      pins.map((pin, pinIndex) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [pin.lng, pin.lat] },
        properties: { pinIndex },
      })),
    );
  }

  markers(bounds: StartupMapBounds, zoom: number): StartupMapMarker[] {
    const z = Math.max(0, Math.min(Math.round(zoom), STARTUPS_MAP_MAX_ZOOM));
    return this.index
      .getClusters([bounds.west, bounds.south, bounds.east, bounds.north], z)
      .map((feature): StartupMapMarker => {
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        const props = feature.properties;
        if ("cluster" in props && props.cluster) {
          const expansionZoom = this.index.getClusterExpansionZoom(
            props.cluster_id,
          );
          return {
            kind: "cluster",
            id: props.cluster_id,
            lat,
            lng,
            count: props.point_count,
            expansionZoom,
            expandable: expansionZoom <= STARTUPS_MAP_MAX_ZOOM,
          };
        }
        return { kind: "pin", pin: this.pins[(props as PinProps).pinIndex]! };
      });
  }

  /** Every pin inside a cluster, however deep. */
  leaves(clusterId: number): StartupMapPin[] {
    return this.index
      .getLeaves(clusterId, Infinity)
      .map((leaf) => this.pins[leaf.properties.pinIndex]!);
  }
}

/** Longitude folded into [-180, 180). */
function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/**
 * Pins inside a viewport. The map wraps, so viewport longitudes can run
 * past ±180; a viewport wider than the world contains every longitude.
 */
export function startupPinsInBounds(
  pins: readonly StartupMapPin[],
  bounds: StartupMapBounds,
): StartupMapPin[] {
  const allLngs = bounds.east - bounds.west >= 360;
  const west = wrapLng(bounds.west);
  const east = wrapLng(bounds.east);
  const crossesDateLine = west > east;
  return pins.filter((pin) => {
    if (pin.lat < bounds.south || pin.lat > bounds.north) return false;
    if (allLngs) return true;
    return crossesDateLine
      ? pin.lng >= west || pin.lng <= east
      : pin.lng >= west && pin.lng <= east;
  });
}

/**
 * The place a group of pins shares: the full name when they all match,
 * else their common last part ("Haifa, Israel" + "Israel" → "Israel"),
 * else null. Only says what every pin's sourced place already says.
 */
export function startupPinsPlace(
  pins: readonly StartupMapPin[],
): string | null {
  const places = pins.map((pin) => pin.region?.trim() ?? "");
  if (places.length === 0 || places.some((place) => !place)) return null;
  if (places.every((place) => place === places[0])) return places[0]!;
  const lastParts = places.map((place) => place.split(",").at(-1)!.trim());
  const shared = lastParts[0]!;
  return lastParts.every(
    (part) => part.toLocaleLowerCase() === shared.toLocaleLowerCase(),
  )
    ? shared
    : null;
}
