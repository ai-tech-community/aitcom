import { describe, expect, it } from "vitest";
import {
  COMMUNITY_LAYERS,
  COMMUNITY_STILL_TICK,
  communityHouseFrame,
  type CommunityFrame,
} from "@/components/ascii/community-house-scene";
import {
  MAX_FIGURES,
  figureCountForMembers,
} from "@/components/ascii/community-house";

const SLUGS = ["ait-community-netherlands", "xxx-ai", "ait", "rotterdam-ml"];

function flat(frame: CommunityFrame): string {
  const rows = frame.scenery.length;
  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    let row = "";
    for (let x = 0; x < frame.scenery[y]!.length; x++) {
      const cell = COMMUNITY_LAYERS.map((l) => frame[l][y]![x]!).find(
        (c) => c !== " ",
      );
      row += cell ?? " ";
    }
    out.push(row);
  }
  return out.join("\n");
}

/** Figures stand on the row two above the bottom; count their legs. */
function figuresIn(frame: CommunityFrame): number {
  const feet = frame.people[frame.people.length - 2] ?? "";
  return feet.split("/ \\").length - 1;
}

describe("figureCountForMembers", () => {
  it("is monotone in members and capped", () => {
    let previous = 0;
    for (let m = 0; m <= 100_000; m += m < 200 ? 1 : 997) {
      const n = figureCountForMembers(m);
      expect(n).toBeGreaterThanOrEqual(previous);
      expect(n).toBeLessThanOrEqual(MAX_FIGURES);
      previous = n;
    }
    expect(figureCountForMembers(1_000_000)).toBe(MAX_FIGURES);
  });

  it("tells a handful apart from a few dozen", () => {
    expect(figureCountForMembers(3)).toBeLessThan(figureCountForMembers(38));
    expect(figureCountForMembers(1)).toBe(1);
  });

  it("draws nobody for zero or nonsense counts", () => {
    expect(figureCountForMembers(0)).toBe(0);
    expect(figureCountForMembers(-4)).toBe(0);
    expect(figureCountForMembers(Number.NaN)).toBe(0);
  });
});

describe("communityHouseFrame", () => {
  it("is deterministic for the same slug, members, size and tick", () => {
    for (const slug of SLUGS) {
      expect(flat(communityHouseFrame(slug, 38, 58, 16, 9))).toBe(
        flat(communityHouseFrame(slug, 38, 58, 16, 9)),
      );
    }
  });

  it("gives different communities different houses", () => {
    const houses = new Set(
      SLUGS.map((slug) => flat(communityHouseFrame(slug, 0, 58, 16))),
    );
    expect(houses.size).toBe(SLUGS.length);
  });

  it("fits every layer exactly into the grid, on every tick and size", () => {
    for (const slug of SLUGS) {
      for (const [cols, rows] of [
        [10, 4],
        [29, 14],
        [44, 16],
        [58, 16],
        [120, 20],
      ] as const) {
        for (let tick = 0; tick < 120; tick += 7) {
          const frame = communityHouseFrame(slug, 5000, cols, rows, tick);
          for (const layer of COMMUNITY_LAYERS) {
            expect(frame[layer]).toHaveLength(rows);
            for (const row of frame[layer]) expect(row).toHaveLength(cols);
          }
        }
      }
    }
  });

  it("gives each cell to at most one layer", () => {
    const frame = communityHouseFrame("ait", 38, 58, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 58; x++) {
        const owners = COMMUNITY_LAYERS.filter((l) => frame[l][y]![x] !== " ");
        expect(owners.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("shows more figures for more members, up to the cap", () => {
    let previous = 0;
    for (const members of [1, 3, 4, 10, 38, 200, 10_000]) {
      const n = figuresIn(communityHouseFrame("ait", members, 58, 16));
      expect(n).toBeGreaterThanOrEqual(previous);
      expect(n).toBeLessThanOrEqual(MAX_FIGURES);
      previous = n;
    }
    expect(figuresIn(communityHouseFrame("ait", 3, 58, 16))).toBe(3);
    expect(figuresIn(communityHouseFrame("ait", 38, 58, 16))).toBe(8);
  });

  it("never lets a huge community overflow a narrow card", () => {
    const frame = communityHouseFrame("ait", 1_000_000, 22, 16);
    expect(figuresIn(frame)).toBe(5);
    for (const row of frame.people) expect(row).toHaveLength(22);
  });

  it("mixes humans and agents whenever two or more stand together", () => {
    for (const slug of SLUGS) {
      for (const members of [2, 4, 38]) {
        const people = communityHouseFrame(slug, members, 58, 16).people.join(
          "\n",
        );
        expect(people).toContain("[•]");
        expect(people).toMatch(/ ?o[ /]/);
      }
    }
  });

  it("is never empty, even with no members or a tiny box", () => {
    for (const [cols, rows] of [
      [10, 6],
      [20, 8],
      [58, 16],
    ] as const) {
      expect(
        flat(communityHouseFrame("xxx-ai", 0, cols, rows)).trim(),
      ).not.toBe("");
    }
  });

  it("draws the house when the box is card-sized", () => {
    for (const slug of SLUGS) {
      const art = flat(communityHouseFrame(slug, 4, 44, 16));
      expect(art).toContain("___");
      expect(art).toContain(".-.");
    }
  });

  it("waves gently over time and holds a still frame", () => {
    const frames = new Set(
      Array.from({ length: 30 }, (_, i) =>
        flat(communityHouseFrame("ait", 38, 58, 16, i * 3)),
      ),
    );
    expect(frames.size).toBeGreaterThan(1);
    const still = flat(communityHouseFrame("ait", 38, 58, 16));
    expect(still).toBe(
      flat(communityHouseFrame("ait", 38, 58, 16, COMMUNITY_STILL_TICK)),
    );
    // Someone is mid-wave in the still frame: a friendly hello.
    expect(communityHouseFrame("ait", 38, 58, 16).people.join("\n")).toMatch(
      /o\/|\]\//,
    );
  });
});

describe("communityHouseFrame headroom", () => {
  it("keeps the top row as open sky", () => {
    for (const slug of [...SLUGS, "a", "b", "c", "d", "e", "f"]) {
      for (const rows of [13, 14, 16, 20]) {
        const frame = communityHouseFrame(slug, 38, 58, rows);
        for (const layer of COMMUNITY_LAYERS)
          expect(frame[layer][0]!.trim()).toBe("");
      }
    }
  });
});
