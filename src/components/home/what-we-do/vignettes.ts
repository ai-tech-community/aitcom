/**
 * Small ASCII vignettes for the homepage "What we do" groups, drawn in the
 * town square's language: humans `o`, agents `[•]`, buildings and furniture
 * with a light 2.5D depth (outline shifted right/up, `/|` receding edges).
 *
 * Pure frame functions — no DOM, no clock, no randomness. A vignette is a
 * fixed-size picture; `fitVignette` centres it in whatever grid the
 * renderer measured. Output has two layers so colour comes from tokens:
 * `scenery` (quiet) and `people` (stronger). Every cell belongs to at most
 * one layer. Original art drawn for AIT Community.
 */

export type VignetteLayer = "scenery" | "people";

export interface VignetteFrame {
  scenery: string[];
  people: string[];
}

export interface Vignette {
  /** Picture size in cells; every frame is exactly this big. */
  width: number;
  height: number;
  /** A calm, representative tick: the reduced-motion frame. */
  stillTick: number;
  frame(tick: number): VignetteFrame;
}

export type VignetteKey = "gather" | "build" | "work" | "learn";

const W = 44;
const H = 11;

// ─── Canvas ──────────────────────────────────────────────────────────────────

class Canvas {
  private chars: string[][];
  private owner: (VignetteLayer | null)[][];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.chars = Array.from({ length: height }, () =>
      Array<string>(width).fill(" "),
    );
    this.owner = Array.from({ length: height }, () =>
      Array<VignetteLayer | null>(width).fill(null),
    );
  }

  put(x: number, y: number, ch: string, layer: VignetteLayer) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.chars[y]![x] = ch;
    this.owner[y]![x] = ch === " " ? null : layer;
  }

  /**
   * Draw lines at (x, y). Spaces outside each line's first..last glyph are
   * transparent; spaces inside are opaque, so a thing hides what is behind.
   */
  sprite(x: number, y: number, lines: readonly string[], layer: VignetteLayer) {
    lines.forEach((line, dy) => {
      const first = line.search(/\S/);
      if (first < 0) return;
      const last = line.trimEnd().length - 1;
      for (let i = first; i <= last; i++)
        this.put(x + i, y + dy, line[i]!, layer);
    });
  }

  frame(): VignetteFrame {
    const out: VignetteFrame = { scenery: [], people: [] };
    for (let y = 0; y < this.height; y++) {
      for (const layer of ["scenery", "people"] as const) {
        let row = "";
        for (let x = 0; x < this.width; x++)
          row += this.owner[y]![x] === layer ? this.chars[y]![x]! : " ";
        out[layer].push(row);
      }
    }
    return out;
  }
}

// ─── Figures (same sprites as the town square) ──────────────────────────────

type Kind = "human" | "agent";

interface FigurePose {
  walking?: boolean;
  /** Arm raised on the right (waving, placing, pinning). */
  armUp?: boolean;
  /** Replaces the body row, e.g. a human holding an open book. */
  body?: string;
}

function figure(kind: Kind, tick: number, pose: FigurePose = {}): string[] {
  const legs = pose.walking && tick % 2 === 1 ? " |\\" : "/ \\";
  if (kind === "agent") {
    const blink = !pose.walking && tick % 37 === 0;
    const head = blink ? "[-]" : "[•]";
    return pose.armUp
      ? [head + "/", "/| ", legs]
      : [head, pose.body ?? "/|\\", legs];
  }
  return pose.armUp ? [" o/", "/| ", legs] : [" o ", pose.body ?? "/|\\", legs];
}

/**
 * A figure that walks in from the left, stands at `slot`, then walks on to
 * `exit`. Returns its x and whether it is walking, or null when off stage.
 */
function walker(
  tick: number,
  opts: {
    period: number;
    offset: number;
    slot: number;
    exit: number;
    walkIn: number;
    stand: number;
    walkOut: number;
  },
): { x: number; walking: boolean; standing: number } | null {
  const t = (((tick + opts.offset) % opts.period) + opts.period) % opts.period;
  const start = -4;
  if (t < opts.walkIn) {
    return {
      x: Math.round(start + ((opts.slot - start) * t) / opts.walkIn),
      walking: true,
      standing: -1,
    };
  }
  const standEnd = opts.walkIn + opts.stand;
  if (t < standEnd)
    return { x: opts.slot, walking: false, standing: t - opts.walkIn };
  const outEnd = standEnd + opts.walkOut;
  if (t < outEnd) {
    return {
      x: Math.round(
        opts.slot + ((opts.exit - opts.slot) * (t - standEnd)) / opts.walkOut,
      ),
      walking: true,
      standing: -1,
    };
  }
  return null;
}

/** Sparse paving dots on the floor rows, like the square's tiles. */
function paving(c: Canvas, rows: readonly number[]) {
  rows.forEach((y, i) => {
    const step = 5 + i * 3;
    for (let x = (i * 3) % step; x < c.width; x += step)
      c.put(x, y, ".", "scenery");
  });
}

// ─── Gather: a hall with bunting, people and agents drifting in ─────────────

const HALL = [
  "      ___/___________________\\___",
  "     /                           /|",
  "    /___________________________/ |",
  "    | []   []   .----.   []   [] | |",
  "    |           |    |           | |",
  "    |___________|    |___________|/",
];

function gather(tick: number): VignetteFrame {
  const c = new Canvas(W, H);
  const sway = Math.floor(tick / 8) % 2 === 0;
  c.sprite(
    9,
    0,
    [sway ? ".-v-.-v-.-v-.-v-.-v-." : ".~v~.~v~.~v~.~v~.~v~."],
    "scenery",
  );
  c.sprite(0, 1, HALL, "scenery");
  c.sprite(0, 7, ["_".repeat(W)], "scenery");
  paving(c, [10]);

  const crowd: { kind: Kind; slot: number; offset: number }[] = [
    { kind: "human", slot: 12, offset: 0 },
    { kind: "agent", slot: 17, offset: 22 },
    { kind: "human", slot: 22, offset: 44 },
    { kind: "agent", slot: 30, offset: 100 },
  ];
  for (const p of crowd) {
    const w = walker(tick, {
      period: 200,
      offset: p.offset,
      slot: p.slot,
      exit: W + 2,
      walkIn: 36,
      stand: 110,
      walkOut: 40,
    });
    if (!w) continue;
    const armUp = !w.walking && w.standing % 40 >= 30 && p.kind === "human";
    c.sprite(
      w.x,
      8,
      figure(p.kind, tick, { walking: w.walking, armUp }),
      "people",
    );
  }
  return c.frame();
}

// ─── Build: a human and an agent stacking blocks on one workbench ───────────

/** A tool rack on the workshop wall, behind the bench. */
const RACK = [
  "  .--------------------------.",
  "  |  T   -o   |=|  /\\/\\  []  |",
  "  '--------------------------'",
];
const BENCH = [
  "         ____________________",
  "        /                   /|",
  "       /___________________/ |",
  "       |___________________|/",
  "        ||               ||",
];
/** Tower slots, bottom row first: a small brick pyramid. */
const BLOCKS: [number, number][] = [
  [11, 6],
  [14, 6],
  [17, 6],
  [12, 5],
  [15, 5],
  [13, 4],
];
const BLOCK_TICKS = 14;
const BUILD_CYCLE = BLOCK_TICKS * BLOCKS.length + 40;

function build(tick: number): VignetteFrame {
  const c = new Canvas(W, H);
  c.sprite(4, 0, RACK, "scenery");
  c.sprite(0, 5, BENCH, "scenery");
  c.sprite(0, 9, ["_".repeat(W)], "scenery");
  paving(c, [10]);

  const t = ((tick % BUILD_CYCLE) + BUILD_CYCLE) % BUILD_CYCLE;
  const placed = Math.min(BLOCKS.length, Math.floor(t / BLOCK_TICKS) + 1);
  for (let i = 0; i < placed; i++) {
    const [x, y] = BLOCKS[i]!;
    c.sprite(x, y, ["[#]"], "people");
  }
  // Whoever placed the newest block still has an arm up for a moment.
  const justPlaced = placed < BLOCKS.length || t < BLOCK_TICKS * BLOCKS.length;
  const placer = (placed - 1) % 2 === 0 ? "human" : "agent";
  const reaching = justPlaced && t % BLOCK_TICKS < 5;

  c.sprite(
    2,
    7,
    figure("human", tick, { armUp: reaching && placer === "human" }),
    "people",
  );
  c.sprite(
    33,
    7,
    figure("agent", tick, { armUp: reaching && placer === "agent" }),
    "people",
  );
  return c.frame();
}

// ─── Work: a job board, and a doorway someone walks through ─────────────────

const BOARD = [
  ".----------------------.",
  "|                      |",
  "|                      |",
  "'----------------------'",
  "   ||              ||",
  "   ||              ||",
  "   ||              ||",
];
const NOTES: [number, number][] = [
  [2, 1],
  [8, 1],
  [15, 1],
  [5, 2],
  [12, 2],
];
const DOOR = [
  " .-------.",
  " |  ___  |",
  " | |   | |",
  " | |   | |",
  " | |   | |",
  " | |   | |",
  "_|_|___|_|_",
];
const DOOR_X = 31;

function work(tick: number): VignetteFrame {
  const c = new Canvas(W, H);
  c.sprite(0, 8, ["_".repeat(W)], "scenery");
  c.sprite(1, 1, BOARD, "scenery");
  c.sprite(DOOR_X, 2, DOOR, "scenery");
  paving(c, [9, 10]);

  // Postings: one new note is pinned every so often.
  const pinned = 3 + (Math.floor(tick / 50) % 3);
  NOTES.slice(0, pinned).forEach(([x, y]) =>
    c.sprite(1 + x, 1 + y, ["[==]"], "people"),
  );

  // The agent keeps the board fresh; its arm goes up as a note goes on.
  const pinning = tick % 50 < 6;
  c.sprite(17, 6, figure("agent", tick, { armUp: pinning }), "people");

  // Someone reads the board, then heads for the door and goes in.
  const reader = walker(tick, {
    period: 170,
    offset: 30,
    slot: 7,
    exit: DOOR_X + 4,
    walkIn: 30,
    stand: 60,
    walkOut: 50,
  });
  if (reader) {
    c.sprite(
      reader.x,
      6,
      figure("human", tick, { walking: reader.walking }),
      "people",
    );
  }
  return c.frame();
}

// ─── Learn: a bookshelf, a chart, a reader and an agent explaining ──────────

const SHELF = [
  ".-------------.",
  "|[]||[]|||[]|||",
  "|-------------|",
  "||[]|||[]||[]||",
  "|-------------|",
  "|||[]||||[]|[]|",
  "|_____________|/",
];
const BAR_X = [30, 33, 36, 39];
const BAR_BASE = [2, 3, 5, 4];

function learn(tick: number): VignetteFrame {
  const c = new Canvas(W, H);
  c.sprite(0, 8, ["_".repeat(W)], "scenery");
  c.sprite(1, 2, SHELF, "scenery");
  // Chart: an axis and bars that slowly shift, like data coming in.
  for (let y = 1; y < 8; y++) c.put(28, y, "|", "scenery");
  c.sprite(28, 8, ["|" + "_".repeat(14)], "scenery");
  BAR_X.forEach((x, i) => {
    const grow = (Math.floor(tick / 24) + i) % 4 === 0 ? 1 : 0;
    const h = BAR_BASE[i]! + grow;
    for (let k = 0; k < h; k++) c.sprite(x, 7 - k, ["||"], "people");
  });

  // A reader with an open book, and an agent pointing at the chart.
  const turning = Math.floor(tick / 18) % 5 === 0;
  c.sprite(
    18,
    6,
    figure("human", tick, { body: turning ? "/=|" : "/=\\" }),
    "people",
  );
  c.sprite(23, 6, figure("agent", tick, { armUp: tick % 60 < 20 }), "people");
  return c.frame();
}

// ─── Registry and fitting ────────────────────────────────────────────────────

export const VIGNETTES: Record<VignetteKey, Vignette> = {
  gather: { width: W, height: H, stillTick: 60, frame: gather },
  build: {
    width: W,
    height: H,
    // Full tower, nobody reaching.
    stillTick: BLOCK_TICKS * BLOCKS.length + 10,
    frame: build,
  },
  // The reader is at the board; the agent is not mid-pin.
  work: { width: W, height: H, stillTick: 40, frame: work },
  learn: { width: W, height: H, stillTick: 30, frame: learn },
};

/**
 * Centre a vignette frame in a `cols` × `rows` grid (cropping the edges if
 * the grid is smaller). Both layers get the same offset.
 */
export function fitVignette(
  frame: VignetteFrame,
  cols: number,
  rows: number,
): VignetteFrame {
  const height = frame.scenery.length;
  const width = frame.scenery[0]?.length ?? 0;
  const top = Math.floor((rows - height) / 2);
  const left = Math.floor((cols - width) / 2);
  const place = (lines: string[]) =>
    Array.from({ length: Math.max(0, rows) }, (_, y) => {
      const src = lines[y - top] ?? "";
      let out = "";
      for (let x = 0; x < cols; x++) out += src[x - left] ?? " ";
      return out;
    });
  return { scenery: place(frame.scenery), people: place(frame.people) };
}
