import { describe, expect, it } from "vitest";
import {
  createTownSquare,
  graphemes,
  textWidth,
  toBoardText,
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
          const far = f.layers.far[y]![x]!;
          if (accent !== " ") return accent;
          if (people !== " ") return people;
          return ch !== " " ? ch : far;
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
        const filled = (["far", "scenery", "people", "accent"] as const).filter(
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

  it("keeps orange to the pin only; the label is drawn in ink", () => {
    const f = frame(TOWN_SQUARE_STATIC_TICK, DESKTOP);
    const accent = f.layers.accent.join("").replace(/\s+/g, "");
    expect(accent).toBe("*");
    expect(f.layers.people.join("\n")).toContain("NEXT UP");
  });

  it("exposes the board panel rectangle for an overlay link", () => {
    const f = frame(TOWN_SQUARE_STATIC_TICK, DESKTOP);
    expect(f.board).not.toBeNull();
    const { x, y, w, h } = f.board!;
    expect(f.layers.scenery[y]!.slice(x, x + w)).toMatch(/^\.-+\.$/);
    expect(f.layers.scenery[y + h - 1]!.slice(x, x + w)).toMatch(/^'-+'$/);
  });

  it("strips emoji from titles and keeps the panel edge aligned", () => {
    const f = frame(TOWN_SQUARE_STATIC_TICK, MOBILE, {
      board: { ...EVENT_BOARD, title: "🚀 AI Meetup 👩🏽‍💻 🇳🇱" },
    });
    expect(f.boardLines).toContain("AI Meetup");
    const { x, y, w } = f.board!;
    for (let r = y; r < y + 6; r++) {
      for (const layer of Object.values(f.layers)) {
        expect(layer[r]).toHaveLength(MOBILE.cols);
      }
      expect(f.layers.scenery[r]![x + w - 1]).toMatch(/[|.']/);
    }
    expect(f.layers.people.join("")).not.toMatch(/\p{Extended_Pictographic}/u);
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

describe("createTownSquare", () => {
  it("reuses the static rows between frames and only moves the lane", () => {
    const scene = createTownSquare(DESKTOP.cols, DESKTOP.rows, {
      board: EVENT_BOARD,
      safeZone: DESKTOP_SAFE,
    });
    const a = scene.frame(TOWN_SQUARE_STATIC_TICK);
    const b = scene.frame(TOWN_SQUARE_STATIC_TICK + 40);
    const lane = new Set([
      DESKTOP.rows - 4,
      DESKTOP.rows - 3,
      DESKTOP.rows - 2,
    ]);
    let laneChanged = false;
    for (let y = 0; y < DESKTOP.rows; y++) {
      const same = a.layers.people[y] === b.layers.people[y];
      if (lane.has(y)) laneChanged ||= !same;
    }
    expect(laneChanged).toBe(true);
    // Houses and the board never change between ticks.
    expect(a.layers.scenery.slice(0, 20)).toEqual(
      b.layers.scenery.slice(0, 20),
    );
    expect(a.board).toEqual(b.board);
  });

  it("matches the one-shot renderer", () => {
    const scene = createTownSquare(MOBILE.cols, MOBILE.rows, {
      board: EVENT_BOARD,
    });
    for (const tick of [0, 99, TOWN_SQUARE_STATIC_TICK, 777]) {
      expect(flatten(scene.frame(tick))).toBe(flatten(frame(tick, MOBILE)));
    }
  });
});

describe("createTownSquare — depth", () => {
  const sizes = [
    ["desktop", DESKTOP, DESKTOP_SAFE],
    ["mobile", { cols: 65, rows: 16 }, null],
    ["tablet", { cols: 106, rows: 38 }, { x: -2, y: -2, w: 102, h: 29 }],
  ] as const;

  it.each(sizes)(
    "grounds every building on the street (%s)",
    (name, size, safe) => {
      const scene = createTownSquare(size.cols, size.rows, {
        board: EVENT_BOARD,
        safeZone: safe,
      });
      const f = scene.frame(TOWN_SQUARE_STATIC_TICK);
      // The tablet copy column is tall; no facade fits beside it there.
      if (name !== "tablet") {
        expect(scene.buildings.length).toBeGreaterThan(0);
      }
      expect(scene.street).toBeLessThan(scene.front);
      for (const b of scene.buildings) {
        expect(b.base).toBe(scene.street);
        // The facade's bottom is drawn on the street row itself; a front
        // lamp may stand before a cell or two, never most of it.
        const base = f.layers.scenery[scene.street]!.slice(b.x, b.x + b.w);
        const drawn = [...base].filter((c) => c === "_" || c === "|").length;
        expect(drawn).toBeGreaterThanOrEqual(b.w - 3);
      }
    },
  );

  it("draws a receding side and a shadow for every building", () => {
    const scene = createTownSquare(DESKTOP.cols, DESKTOP.rows, {
      board: EVENT_BOARD,
      safeZone: DESKTOP_SAFE,
    });
    const f = scene.frame(TOWN_SQUARE_STATIC_TICK);
    for (const b of scene.buildings) {
      const right = b.x + b.w - 1;
      const side = f.layers.scenery
        .slice(b.y - 1, scene.street + 1)
        .map((row) => row[right + 1])
        .join("");
      expect(side).toMatch(/\//); // receding roof/base edges
      expect(side).toMatch(/:/); // shaded side face
      expect(f.layers.scenery[scene.street + 1]!.slice(b.x, right + 4)).toMatch(
        /[:.]/,
      );
    }
  });

  it("puts figures on the two floor lines only", () => {
    const scene = createTownSquare(DESKTOP.cols, DESKTOP.rows, {
      board: EVENT_BOARD,
    });
    for (let tick = 0; tick < TOWN_SQUARE_CYCLE; tick += 11) {
      for (const fig of scene.frame(tick).figures) {
        const feet = fig.y + 2;
        expect(fig.depth === "back" ? scene.street : scene.front).toBe(feet);
      }
    }
  });

  it("draws back-lane passers-by fainter than the front groups", () => {
    const scene = createTownSquare(DESKTOP.cols, DESKTOP.rows, {
      board: EVENT_BOARD,
    });
    let seen = false;
    for (let tick = 0; tick < 800 && !seen; tick += 3) {
      const f = scene.frame(tick);
      for (const fig of f.figures.filter((x) => x.depth === "back")) {
        if (fig.x < 0 || fig.x + 3 > DESKTOP.cols) continue;
        const head = fig.kind === "agent" ? "[•]" : "o";
        const row = fig.y;
        if (f.layers.scenery[row]!.slice(fig.x, fig.x + 3).includes(head)) {
          expect(f.layers.people[row]!.slice(fig.x, fig.x + 3).trim()).toBe("");
          seen = true;
        }
      }
    }
    expect(seen).toBe(true);
  });

  it("keeps distant rooftops strictly behind (above) the street", () => {
    const f = frame(TOWN_SQUARE_STATIC_TICK, DESKTOP, {
      safeZone: DESKTOP_SAFE,
    });
    const scene = createTownSquare(DESKTOP.cols, DESKTOP.rows, {
      board: EVENT_BOARD,
      safeZone: DESKTOP_SAFE,
    });
    f.layers.far.forEach((row, y) => {
      if (row.trim()) expect(y).toBeLessThan(scene.street);
    });
  });
});

describe("board text helpers", () => {
  it("counts graphemes, not UTF-16 units", () => {
    expect(graphemes("e\u0301te")).toHaveLength(3);
    expect(textWidth("AI")).toBe(2);
    expect(textWidth("東京")).toBe(4);
  });

  it("removes emoji and tidies spaces", () => {
    expect(toBoardText("🚀 AI Meetup")).toBe("AI Meetup");
    expect(toBoardText("Hack 👩🏽‍💻 night 🇳🇱!")).toBe("Hack night !");
  });

  it("wraps wide glyphs by cell width", () => {
    for (const line of wrapText("東京 AI ミートアップ 2026", 8, 3)) {
      expect(textWidth(line)).toBeLessThanOrEqual(8);
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
