import { describe, expect, it } from "vitest";
import {
  TOWN_SQUARE_CYCLE,
  TOWN_SQUARE_STATIC_TICK,
  renderTownSquare,
  wrapText,
  type NoticeBoardContent,
  type TownSquareData,
  type TownSquareFrame,
} from "./town-square-scene";

const EVENT_BOARD: NoticeBoardContent = {
  kind: "event",
  label: "Next up",
  title: "Agents in Production",
  when: "Sat 12 Oct · 19:00",
};

const EMPTY_BOARD: NoticeBoardContent = {
  kind: "empty",
  label: "Next up",
  message: "New gatherings are being planned.",
};

const DESKTOP = { cols: 200, rows: 40 };
const DESKTOP_SAFE = { x: 0, y: 0, w: 96, h: 28 };
const MOBILE = { cols: 60, rows: 14 };

function frame(
  tick: number,
  size: { cols: number; rows: number },
  data: Partial<TownSquareData> = {},
): TownSquareFrame {
  return renderTownSquare(tick, size.cols, size.rows, {
    board: EVENT_BOARD,
    ...data,
  });
}

function flatten(f: TownSquareFrame): string {
  return f.layers.scenery
    .map((row, y) =>
      [...row]
        .map((ch, x) => {
          const accent = f.layers.accent[y]![x]!;
          const people = f.layers.people[y]![x]!;
          return accent !== " " ? accent : people !== " " ? people : ch;
        })
        .join(""),
    )
    .join("\n");
}

describe("renderTownSquare — frame shape", () => {
  it.each([
    [200, 40],
    [60, 14],
    [110, 16],
    [8, 4],
    [3, 2],
    [0, 0],
  ])("every layer is exactly %i cols × %i rows", (cols, rows) => {
    const f = renderTownSquare(TOWN_SQUARE_STATIC_TICK, cols, rows, {
      board: EVENT_BOARD,
    });
    for (const layer of Object.values(f.layers)) {
      expect(layer).toHaveLength(rows);
      for (const line of layer) expect(line).toHaveLength(cols);
    }
  });

  it("gives each cell to at most one layer", () => {
    const f = frame(TOWN_SQUARE_STATIC_TICK, DESKTOP);
    for (let y = 0; y < f.rows; y++) {
      for (let x = 0; x < f.cols; x++) {
        const filled = (["scenery", "people", "accent"] as const).filter(
          (l) => f.layers[l][y]![x] !== " ",
        );
        expect(filled.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is deterministic for the same inputs and varies with the seed", () => {
    const a = frame(123, DESKTOP, { seed: 7 });
    const b = frame(123, DESKTOP, { seed: 7 });
    const c = frame(123, DESKTOP, { seed: 8 });
    expect(flatten(a)).toBe(flatten(b));
    expect(flatten(a)).not.toBe(flatten(c));
  });

  it("moves figures between ticks", () => {
    const a = frame(TOWN_SQUARE_STATIC_TICK, DESKTOP);
    const b = frame(TOWN_SQUARE_STATIC_TICK + 5, DESKTOP);
    expect(flatten(a)).not.toBe(flatten(b));
  });
});

describe("renderTownSquare — people and agents", () => {
  it.each([
    ["desktop", DESKTOP],
    ["mobile", MOBILE],
  ])("draws both humans and agents on %s", (_, size) => {
    const f = frame(TOWN_SQUARE_STATIC_TICK, size);
    const kinds = new Set(f.figures.map((fig) => fig.kind));
    expect(kinds).toEqual(new Set(["human", "agent"]));
    const art = flatten(f);
    expect(art).toContain("[•]"); // agent head
    expect(art).toMatch(/ o[ /]/); // human head
  });

  it("shows several groups gathered in the representative frame", () => {
    const f = frame(TOWN_SQUARE_STATIC_TICK, DESKTOP, {
      safeZone: DESKTOP_SAFE,
    });
    const groups = new Set(
      f.figures.filter((x) => x.phase === "gathered").map((x) => x.group),
    );
    expect(groups.size).toBeGreaterThanOrEqual(3);
  });

  it("always gathers 2–3 figures that mix humans and agents", () => {
    for (let tick = 0; tick < TOWN_SQUARE_CYCLE * 3; tick += 7) {
      for (const size of [DESKTOP, MOBILE]) {
        const f = frame(tick, size, { seed: 3 });
        const byGroup = new Map<number, Set<string>>();
        const counts = new Map<number, number>();
        for (const fig of f.figures) {
          if (fig.phase !== "gathered") continue;
          byGroup.set(
            fig.group,
            (byGroup.get(fig.group) ?? new Set()).add(fig.kind),
          );
          counts.set(fig.group, (counts.get(fig.group) ?? 0) + 1);
        }
        for (const [group, kinds] of byGroup) {
          // Stragglers can still be arriving; once the whole group has
          // gathered it must be a mixed group of 2–3.
          const total = f.figures.filter((x) => x.group === group).length;
          if (counts.get(group) !== total) continue;
          expect(total).toBeGreaterThanOrEqual(2);
          expect(total).toBeLessThanOrEqual(3);
          expect(kinds).toEqual(new Set(["human", "agent"]));
        }
      }
    }
  });
});

describe("renderTownSquare — notice board", () => {
  it("shows the next event's title and date", () => {
    const f = frame(TOWN_SQUARE_STATIC_TICK, DESKTOP);
    const art = flatten(f);
    expect(art).toContain("NEXT UP");
    expect(art).toContain("Agents in Production");
    expect(art).toContain("Sat 12 Oct · 19:00");
    expect(f.boardLines).toContain("Agents in Production");
  });

  it("shows the calm fallback line when nothing is scheduled", () => {
    const f = frame(TOWN_SQUARE_STATIC_TICK, DESKTOP, { board: EMPTY_BOARD });
    const art = flatten(f);
    expect(f.boardLines.slice(1).join(" ")).toBe(
      "New gatherings are being planned.",
    );
    expect(art).toContain("New gatherings are being");
    expect(art).not.toContain("Agents in Production");
  });

  it("truncates long titles gracefully on a phone-sized board", () => {
    const f = frame(TOWN_SQUARE_STATIC_TICK, MOBILE, {
      board: {
        kind: "event",
        label: "Hierna",
        title:
          "Verantwoorde AI-agenten in productie: een praktijkavond met de gemeenschap",
        when: "za 12 okt · 19:00",
      },
    });
    const art = flatten(f);
    expect(art).toContain("HIERNA");
    expect(art).toContain("za 12 okt · 19:00");
    expect(f.boardLines.some((l) => l.endsWith("…"))).toBe(true);
    expect(art).not.toContain("gemeenschap");
  });

  it("keeps the orange accent to the board marker and label", () => {
    const f = frame(TOWN_SQUARE_STATIC_TICK, DESKTOP);
    const accent = f.layers.accent.join("").replace(/\s+/g, " ").trim();
    expect(accent).toBe("* NEXT UP");
  });
});

describe("renderTownSquare — text-safe region", () => {
  it("never draws inside the reserved region at any tick", () => {
    const safe = DESKTOP_SAFE;
    for (let tick = 0; tick < TOWN_SQUARE_CYCLE * 2; tick += 5) {
      const f = frame(tick, DESKTOP, { safeZone: safe });
      for (const layer of Object.values(f.layers)) {
        for (let y = safe.y; y < safe.y + safe.h; y++) {
          const slice = layer[y]!.slice(safe.x, safe.x + safe.w);
          expect(slice.trim()).toBe("");
        }
      }
    }
  });

  it("still draws the plaza outside the reserved region", () => {
    const f = frame(TOWN_SQUARE_STATIC_TICK, DESKTOP, {
      safeZone: DESKTOP_SAFE,
    });
    expect(f.boardLines.length).toBeGreaterThan(0);
    expect(f.figures.length).toBeGreaterThan(0);
  });

  it("handles a safe zone that covers the whole scene", () => {
    const f = frame(TOWN_SQUARE_STATIC_TICK, MOBILE, {
      safeZone: { x: 0, y: 0, w: MOBILE.cols, h: MOBILE.rows },
    });
    for (const layer of Object.values(f.layers)) {
      expect(layer.join("").trim()).toBe("");
    }
  });
});

describe("wrapText", () => {
  it("wraps on word boundaries", () => {
    expect(wrapText("one two three four", 9, 3)).toEqual([
      "one two",
      "three",
      "four",
    ]);
  });

  it("ends with an ellipsis when text overflows the line budget", () => {
    const lines = wrapText("one two three four five", 9, 2);
    expect(lines).toEqual(["one two", "three…"]);
  });

  it("hard-cuts words longer than a line", () => {
    const lines = wrapText("Supercalifragilistic", 8, 1);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.length).toBeLessThanOrEqual(8);
  });

  it("never returns lines longer than the width", () => {
    const text =
      "Verantwoorde AI-agenten in productie: een praktijkavond met de gemeenschap";
    for (let w = 4; w < 40; w++) {
      for (const line of wrapText(text, w, 2)) {
        expect(line.length).toBeLessThanOrEqual(w);
      }
    }
  });
});
