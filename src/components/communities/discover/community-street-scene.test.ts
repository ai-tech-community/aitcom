import { describe, expect, it } from "vitest";
import { MIN_LANE_WIDTH } from "@/components/ascii/community-house";
import {
  MAX_STREET_HOUSES,
  MIN_STREET_ROWS,
  STREET_LAYERS,
  communityStreetFrame,
  STREET_LANE_WIDTH,
  litWindowCount,
  planStreet,
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

describe("planStreet", () => {
  it("fits as many houses as the width allows, capped", () => {
    expect(planStreet(MIN_LANE_WIDTH * 3, 10).houses).toBe(3);
    expect(planStreet(MIN_LANE_WIDTH * 3 - 1, 10).houses).toBe(2);
    expect(planStreet(STREET_LANE_WIDTH * 6, 10).houses).toBe(6);
    expect(planStreet(10_000, 20).houses).toBe(MAX_STREET_HOUSES);
    expect(planStreet(1000, 2).houses).toBe(2);
    expect(planStreet(0, 5).houses).toBe(0);
  });

  it("gives a wide street readable lanes and packs a narrow one", () => {
    for (const lane of planStreet(200, 10).lanes) {
      expect(lane.width).toBeGreaterThanOrEqual(STREET_LANE_WIDTH);
    }
    expect(planStreet(54, 10).houses).toBe(3);
  });

  it("keeps the reserved strip free and lanes after it", () => {
    const plan = planStreet(200, 10, { reserve: 0.4 });
    expect(plan.start).toBe(80);
    expect(plan.lanes[0]!.x).toBe(80);
    const last = plan.lanes[plan.lanes.length - 1]!;
    expect(last.x + last.width).toBe(200);
    expect(plan.houses).toBe(Math.floor(120 / STREET_LANE_WIDTH));
  });

  it("puts the lot after the last house, or on the last lane when full", () => {
    const roomy = planStreet(MIN_LANE_WIDTH * 5, 2, { lot: true });
    expect(roomy).toMatchObject({ houses: 2, lot: true });
    expect(roomy.lanes).toHaveLength(3);
    const full = planStreet(MIN_LANE_WIDTH * 3, 10, { lot: true });
    expect(full).toMatchObject({ houses: 2, lot: true });
    expect(planStreet(MIN_LANE_WIDTH, 0, { lot: true }).lot).toBe(true);
    expect(planStreet(MIN_LANE_WIDTH, 1, { lot: true })).toMatchObject({
      houses: 1,
      lot: false,
    });
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
      const frame = communityStreetFrame(STREET, cols, rows, { tick: 5 });
      for (const layer of STREET_LAYERS) {
        expect(frame[layer]).toHaveLength(rows);
        for (const line of frame[layer]) expect(line).toHaveLength(cols);
      }
    }
  });

  it("is deterministic for the same input", () => {
    expect(communityStreetFrame(STREET, 88, 20, { tick: 9 })).toEqual(
      communityStreetFrame(STREET, 88, 20, { tick: 9 }),
    );
  });

  it("gives every cell to at most one layer", () => {
    const frame = communityStreetFrame(STREET, 88, 20, {
      tick: 3,
      activeSlug: STREET[0]!.slug,
    });
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
    const idle = communityStreetFrame(STREET, 88, 20, { tick: 1 });
    const active = communityStreetFrame(STREET, 88, 20, {
      tick: 1,
      activeSlug: STREET[1]!.slug,
    });
    expect(count(active, "people", ".-.")).toBe(1);
    expect(count(idle, "people", ".-.")).toBe(0);
    // Bracketed (and shortened to fit its lane) so the mark is not ink alone.
    expect(count(active, "glow", "[ mlops-community")).toBe(1);
    expect(count(idle, "glow", "[ ")).toBe(0);
  });

  it("never shows more houses than fit", () => {
    const many = Array.from({ length: 10 }, (_, i) => house(`c-${i}`));
    const frame = communityStreetFrame(many, 60, 20);
    expect(count(frame, "scenery", ".-.")).toBe(planStreet(60, 10).houses);
  });

  it("rises into a tall street instead of leaving empty sky", () => {
    const rows = 40;
    const frame = communityStreetFrame(STREET, 88, rows);
    const firstInked = Array.from({ length: rows }, (_, y) =>
      row(frame, y),
    ).findIndex((line) => line.trim().length > 0);
    expect(firstInked).toBeLessThan(rows / 3);
  });

  it("draws the lot's sign and leaves the reserved strip without houses", () => {
    const frame = communityStreetFrame(STREET, 120, 20, {
      reserve: 0.3,
      lotLabel: "Your house?",
    });
    expect(count(frame, "people", "| Your house? |")).toBe(1);
    for (let y = 0; y < 20; y++) {
      // Only the paving (and its dots) may cross the reserved strip.
      expect(row(frame, y).slice(0, 36).replace(/[_. ]/g, "")).toBe("");
    }
  });

  it("puts a speech bubble only over houses whose rooms are talking", () => {
    const quiet = communityStreetFrame(STREET, 120, 30);
    expect(count(quiet, "people", "--v--")).toBe(0);
    const talking = communityStreetFrame(
      STREET.map((h, i) => ({ ...h, talking: i === 1 })),
      120,
      30,
    );
    expect(count(talking, "people", "--v--")).toBe(1);
  });

  it("never draws a bubble on a house, and skips it when no sky is left", () => {
    const everyone = STREET.map((h) => ({ ...h, talking: true }));
    // A packed, short street: no lane has room above or beside its house.
    const packed = communityStreetFrame(everyone, 45, MIN_STREET_ROWS);
    expect(count(packed, "people", "--v--")).toBe(0);
    const roomy = communityStreetFrame(everyone, 120, 30);
    expect(count(roomy, "people", "--v--")).toBe(STREET.length);
    // Every house still has its door: nothing was drawn over it.
    expect(count(roomy, "scenery", ".-.")).toBe(STREET.length);
  });

  it("puts scaffolding only around new houses, without covering them", () => {
    const plain = communityStreetFrame(STREET, 120, 24);
    expect(count(plain, "far", "+")).toBe(0);
    const fresh = communityStreetFrame(
      STREET.map((h, i) => ({ ...h, isNew: i === 0 })),
      120,
      24,
    );
    // Light poles with caps and planks, around the house…
    expect(count(fresh, "far", "+")).toBe(2);
    expect(count(fresh, "far", "=")).toBeGreaterThan(0);
    // …never across its front: the house's own lines carry no plank.
    expect(fresh.scenery.join("").includes("=")).toBe(false);
    expect(count(fresh, "scenery", ".-.")).toBe(STREET.length);
    expect(fresh.glow).toEqual(communityStreetFrame(STREET, 120, 24).glow);
  });

  it("lets stars out only at night, and only into empty sky", () => {
    const day = communityStreetFrame(STREET, 120, 30);
    const night = communityStreetFrame(STREET, 120, 30, { night: true });
    const stars = (f: StreetFrame) =>
      f.glow.join("").replace(/[^+.']/g, "").length;
    expect(stars(day)).toBe(0);
    expect(stars(night)).toBeGreaterThan(0);
    // The rest of the picture is the same.
    expect(night.scenery).toEqual(day.scenery);
    expect(night.people).toEqual(day.people);
  });

  it("keeps stars out of the strip kept for the headline", () => {
    const night = communityStreetFrame(STREET, 120, 30, {
      night: true,
      reserve: 0.4,
    });
    for (const line of night.glow) {
      expect(line.slice(0, 48).replace(/ /g, "")).toBe("");
    }
  });
});
