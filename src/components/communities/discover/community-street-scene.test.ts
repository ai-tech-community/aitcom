import { describe, expect, it } from "vitest";
import { MIN_LANE_WIDTH } from "@/components/ascii/community-house";
import {
  MAX_STREET_HOUSES,
  MIN_STREET_ROWS,
  STREET_LAYERS,
  communityStreetFrame,
  litWindowCount,
  streetCapacity,
  streetLanes,
  type StreetFrame,
  type StreetHouse,
} from "./community-street-scene";

function house(slug: string, over: Partial<StreetHouse> = {}): StreetHouse {
  return {
    slug,
    name: slug,
    memberCount: 4,
    activeRecently: 0,
    hasUpcomingEvent: false,
    ...over,
  };
}

const STREET = [
  house("ait-community-netherlands", { activeRecently: 3 }),
  house("mlops-community-amsterdam"),
  house("grok-bot-training", { hasUpcomingEvent: true }),
];

/** Row `y` as seen on screen: the first non-blank layer wins per cell. */
function row(frame: StreetFrame, y: number): string {
  const width = frame.far[y]!.length;
  let out = "";
  for (let x = 0; x < width; x++) {
    const hit = STREET_LAYERS.find((l) => frame[l][y]![x] !== " ");
    out += hit ? frame[hit][y]![x] : " ";
  }
  return out;
}

function count(frame: StreetFrame, layer: keyof StreetFrame, s: string) {
  return frame[layer].join("\n").split(s).length - 1;
}

describe("streetCapacity", () => {
  it("fits as many houses as the width allows, capped", () => {
    expect(streetCapacity(MIN_LANE_WIDTH * 3, 10)).toBe(3);
    expect(streetCapacity(MIN_LANE_WIDTH * 3 - 1, 10)).toBe(2);
    expect(streetCapacity(1000, 10)).toBe(MAX_STREET_HOUSES);
    expect(streetCapacity(1000, 2)).toBe(2);
    expect(streetCapacity(0, 5)).toBe(0);
  });
});

describe("streetLanes", () => {
  it("splits the width into contiguous equal fractions", () => {
    const lanes = streetLanes(3, 88);
    expect(lanes[0]!.x).toBe(0);
    for (let i = 1; i < lanes.length; i++) {
      expect(lanes[i]!.x).toBe(lanes[i - 1]!.x + lanes[i - 1]!.width);
      expect(lanes[i]!.x).toBe(Math.round((i * 88) / 3));
    }
    const last = lanes[lanes.length - 1]!;
    expect(last.x + last.width).toBe(88);
  });
});

describe("litWindowCount", () => {
  it("lights nothing when nobody was active", () => {
    expect(litWindowCount(0, 6)).toBe(0);
  });
  it("lights at least one window for one active person", () => {
    expect(litWindowCount(1, 2)).toBe(1);
  });
  it("grows with activity and caps at every window", () => {
    expect(litWindowCount(3, 6)).toBeGreaterThan(litWindowCount(1, 6));
    expect(litWindowCount(60, 6)).toBe(6);
  });
});

describe("communityStreetFrame", () => {
  it("keeps every row of every layer exactly cols wide", () => {
    for (const [cols, rows] of [
      [88, 20],
      [54, MIN_STREET_ROWS],
      [20, 6],
      [0, 0],
    ] as const) {
      const frame = communityStreetFrame(STREET, cols, rows, 5);
      for (const layer of STREET_LAYERS) {
        expect(frame[layer]).toHaveLength(rows);
        for (const line of frame[layer]) expect(line).toHaveLength(cols);
      }
    }
  });

  it("is deterministic for the same input", () => {
    expect(communityStreetFrame(STREET, 88, 20, 9)).toEqual(
      communityStreetFrame(STREET, 88, 20, 9),
    );
  });

  it("gives every cell to at most one layer", () => {
    const frame = communityStreetFrame(STREET, 88, 20, 3, STREET[0]!.slug);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 88; x++) {
        const owners = STREET_LAYERS.filter((l) => frame[l][y]![x] !== " ");
        expect(owners.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("draws a house for each community at the smallest supported height", () => {
    const frame = communityStreetFrame(STREET, 88, MIN_STREET_ROWS);
    expect(count(frame, "scenery", ".-.")).toBe(STREET.length);
  });

  it("lights windows only for communities with recent activity", () => {
    const quiet = communityStreetFrame(
      STREET.map((h) => ({ ...h, activeRecently: 0 })),
      88,
      20,
    );
    expect(count(quiet, "glow", "##")).toBe(0);
    const busy = communityStreetFrame(
      STREET.map((h) => ({ ...h, activeRecently: 3 })),
      88,
      20,
    );
    expect(count(busy, "glow", "##")).toBeGreaterThan(0);
  });

  it("flies a flag only over houses with an upcoming event", () => {
    const frame = communityStreetFrame(STREET, 88, 20);
    expect(count(frame, "glow", "|>")).toBe(1);
    const none = communityStreetFrame(
      STREET.map((h) => ({ ...h, hasUpcomingEvent: false })),
      88,
      20,
    );
    expect(count(none, "glow", "|>")).toBe(0);
  });

  it("names each house on the bottom row, shortened when the lane is tight", () => {
    const frame = communityStreetFrame(STREET, 54, MIN_STREET_ROWS);
    const names = row(frame, MIN_STREET_ROWS - 1);
    expect(names).toContain("grok-bot-training".slice(0, 5));
    expect(names).toContain("…");
  });

  it("inks the active house at full strength and leaves the others quiet", () => {
    const idle = communityStreetFrame(STREET, 88, 20, 1, null);
    const active = communityStreetFrame(STREET, 88, 20, 1, STREET[1]!.slug);
    expect(count(active, "people", ".-.")).toBe(1);
    expect(count(idle, "people", ".-.")).toBe(0);
    expect(count(active, "glow", STREET[1]!.name)).toBe(1);
  });

  it("never shows more houses than fit", () => {
    const many = Array.from({ length: 10 }, (_, i) => house(`c-${i}`));
    const frame = communityStreetFrame(many, 60, 20);
    expect(count(frame, "scenery", ".-.")).toBe(streetCapacity(60, 10));
  });

  it("rises into a tall street instead of leaving empty sky", () => {
    const rows = 40;
    const frame = communityStreetFrame(STREET, 88, rows);
    const firstInked = Array.from({ length: rows }, (_, y) => row(frame, y))
      .findIndex((line) => line.trim().length > 0);
    expect(firstInked).toBeLessThan(rows / 3);
  });
});
