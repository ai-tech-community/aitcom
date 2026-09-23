import { describe, expect, it } from "vitest";

import type { StartupMapPin } from "./startups";
import {
  STARTUPS_MAP_MAX_ZOOM,
  StartupClusterIndex,
  startupPinsInBounds,
  startupPinsPlace,
} from "./startups-map-clusters";

function pin(
  id: string,
  lat: number,
  lng: number,
  region: string | null = null,
): StartupMapPin {
  return {
    id,
    name: id,
    homepage: `https://${id}.example`,
    slug: id,
    lat,
    lng,
    region,
    precision: "city",
  };
}

const WORLD = { west: -180, south: -85, east: 180, north: 85 };

describe("StartupClusterIndex", () => {
  it("groups nearby pins into one counted bubble when zoomed out", () => {
    const index = new StartupClusterIndex([
      pin("a", 52.37, 4.9),
      pin("b", 52.09, 5.12),
      pin("c", 51.92, 4.48),
      pin("far", 37.77, -122.42),
    ]);
    const markers = index.markers(WORLD, 3);
    const cluster = markers.find((marker) => marker.kind === "cluster");
    expect(cluster).toMatchObject({ kind: "cluster", count: 3 });
    expect(markers.filter((marker) => marker.kind === "pin")).toHaveLength(1);
    if (cluster?.kind !== "cluster") throw new Error("expected a cluster");
    expect(cluster.expandable).toBe(true);
    expect(
      index
        .leaves(cluster.id)
        .map((leaf) => leaf.id)
        .sort(),
    ).toEqual(["a", "b", "c"]);
  });

  it("splits clusters into single pins at deeper zoom", () => {
    const index = new StartupClusterIndex([
      pin("a", 52.37, 4.9),
      pin("b", 51.92, 4.48),
    ]);
    expect(
      index
        .markers(WORLD, STARTUPS_MAP_MAX_ZOOM)
        .every((m) => m.kind === "pin"),
    ).toBe(true);
  });

  it("marks pins that share one place as a cluster zoom cannot split", () => {
    const index = new StartupClusterIndex([
      pin("a", 31.05, 34.85, "Israel"),
      pin("b", 31.05, 34.85, "Israel"),
      pin("c", 31.05, 34.85, "Israel"),
    ]);
    const [marker] = index.markers(WORLD, STARTUPS_MAP_MAX_ZOOM);
    expect(marker).toMatchObject({
      kind: "cluster",
      count: 3,
      expandable: false,
    });
  });

  it("clamps zoom into the supported range", () => {
    const index = new StartupClusterIndex([pin("a", 52.37, 4.9)]);
    expect(index.markers(WORLD, 40)).toHaveLength(1);
    expect(index.markers(WORLD, -3)).toHaveLength(1);
  });
});

describe("startupPinsInBounds", () => {
  const pins = [
    pin("ams", 52.37, 4.9),
    pin("sf", 37.77, -122.42),
    pin("fiji", -17.7, 178.1),
    pin("samoa", -13.8, -172.1),
  ];

  it("keeps only pins inside the viewport", () => {
    expect(
      startupPinsInBounds(pins, {
        west: 0,
        south: 40,
        east: 10,
        north: 60,
      }).map((p) => p.id),
    ).toEqual(["ams"]);
  });

  it("handles a viewport across the date line", () => {
    expect(
      startupPinsInBounds(pins, {
        west: 170,
        south: -30,
        east: 190,
        north: 0,
      }).map((p) => p.id),
    ).toEqual(["fiji", "samoa"]);
  });

  it("treats a viewport wider than the world as every longitude", () => {
    expect(
      startupPinsInBounds(pins, {
        west: -400,
        south: -85,
        east: 400,
        north: 85,
      }),
    ).toHaveLength(4);
  });
});

describe("startupPinsPlace", () => {
  it("names the shared place and stays silent when places differ", () => {
    expect(
      startupPinsPlace([pin("a", 0, 0, "Israel"), pin("b", 0, 0, "Israel")]),
    ).toBe("Israel");
    expect(
      startupPinsPlace([pin("a", 0, 0, "Israel"), pin("b", 0, 0, "Berlin")]),
    ).toBeNull();
    expect(startupPinsPlace([])).toBeNull();
  });

  it("falls back to the shared country when towns differ", () => {
    expect(
      startupPinsPlace([
        pin("a", 0, 0, "Israel"),
        pin("b", 0, 0, "Haifa, Haifa District, Israel"),
        pin("c", 0, 0, "Tel Aviv, ISRAEL"),
      ]),
    ).toBe("Israel");
    expect(
      startupPinsPlace([pin("a", 0, 0, "Israel"), pin("b", 0, 0, null)]),
    ).toBeNull();
  });
});
