/**
 * The homepage "town square": an original ASCII plaza where people and AI
 * agents walk in, gather in small mixed groups and drift away again.
 *
 * Pure frame function — no DOM, no clock, no Math.random. Everything is a
 * deterministic function of `(tick, cols, rows, data)`, so any frame can be
 * reproduced in tests and the reduced-motion frame is just a chosen tick.
 *
 * Art: original work drawn for AIT Community (no third-party pieces), so no
 * artist initials are embedded — see `communities/discover/ascii-art.ts` for
 * the attribution convention used when art is sourced.
 *
 * Output is layered so the renderer can colour by CSS tokens:
 * - `scenery` — houses, props, pavement (quiet)
 * - `people`  — figures and notice-board text (stronger)
 * - `accent`  — the notice-board marker + label (the one orange accent)
 * Every cell belongs to at most one layer.
 */

import type { CellRect } from "@/components/ascii/measure";

export type FigureKind = "human" | "agent";

export type NoticeBoardContent =
  | { kind: "event"; label: string; title: string; when: string }
  | { kind: "empty"; label: string; message: string };

export interface TownSquareData {
  board: NoticeBoardContent;
  /** Cells the scene must never draw into (the headline + copy column). */
  safeZone?: CellRect | null;
  seed?: number;
}

/**
 * Back to front: `far` (distant rooftops, faintest), `scenery` (square,
 * houses, props, back-lane passers-by), `people` (front groups + board
 * text), `accent` (the board pin, the one orange).
 */
export type SceneLayer = "far" | "scenery" | "people" | "accent";

/** `passing`: a passer-by on the back street, not part of a group. */
export type FigurePhase = "arriving" | "gathered" | "leaving" | "passing";

/** Which walking line of the square a figure stands on. */
export type FigureDepth = "back" | "front";

export interface FigureSnapshot {
  id: string;
  kind: FigureKind;
  /** Gathering spot index; -1 for passers-by. */
  group: number;
  phase: FigurePhase;
  depth: FigureDepth;
  /** Left column of the 3×3 sprite. */
  x: number;
  /** Top row of the sprite. */
  y: number;
}

export interface TownSquareFrame {
  cols: number;
  rows: number;
  layers: Record<SceneLayer, string[]>;
  figures: FigureSnapshot[];
  /** Text lines shown on the notice board (empty when it did not fit). */
  boardLines: string[];
  /** Board panel in cells (for an accessible overlay link), or null. */
  board: CellRect | null;
}

/** A building's front face in cells; its base row is always the street. */
export interface BuildingRect extends CellRect {
  base: number;
}

// ─── Timeline ────────────────────────────────────────────────────────────────

/** Ticks per full choreography cycle. */
export const TOWN_SQUARE_CYCLE = 480;
const WALK_IN = 80;
const STAGGER = 12;
const STAND = 160;
const SPOT_OFFSET = 60;
const LEAVE_BUDGET = 180;

/**
 * A tick where every gathering spot holds a group (and one more is still
 * walking in). Used as the reduced-motion frame and as the animation start.
 */
export const TOWN_SQUARE_STATIC_TICK = 250;

// ─── Sprites ─────────────────────────────────────────────────────────────────

const FIGURE_W = 3;
const FIGURE_H = 3;

const HUMAN_HEAD = " o ";
const HUMAN_WAVE = " o/";
const AGENT_HEAD = "[•]";
const AGENT_BLINK = "[-]";
const BODY = "/|\\";
const BODY_WAVE = "/| ";
const LEGS = "/ \\";
const LEGS_STEP = " |\\";

const FOUNTAIN_SPRAY: [string, string][] = [
  ["  .  :  .  ", " '   |   ' "],
  [" .   :   . ", "  '  |  '  "],
];
const FOUNTAIN_BASE = [".----+----.", null, "'---------'"] as const;
const FOUNTAIN_WATER = ["|~-~-~-~-~|", "|-~-~-~-~-|"];

const LAMP = [".-.", "|o|", "'+'", " | ", " | ", "_|_"];
/** Phone-sized squares: a shorter lamp so it doesn't block a doorway. */
const LAMP_SHORT = [".-.", "|o|", " | ", "_|_"];
const BENCH = ["._______.", "||     ||"];
const TREE = [
  "  .--.  ",
  " (    ) ",
  "(  ..  )",
  " `-..-' ",
  "   ||   ",
  "   ||   ",
];

type PropKind = "fountain" | "lamp" | "bench" | "tree";
/** `gap` is open paving where a group can gather. */
type SlotKind = PropKind | "gap";

const GAP_W = 17;

const PROP_SIZE: Record<SlotKind, { w: number; h: number }> = {
  gap: { w: GAP_W, h: 3 },
  fountain: { w: 11, h: 5 },
  lamp: { w: LAMP[0]!.length, h: LAMP.length },
  bench: { w: BENCH[0]!.length, h: BENCH.length },
  tree: { w: TREE[0]!.length, h: TREE.length },
};

/** Rhythm of the square, laid out right to left starting at the board. */
const PROP_SEQUENCE: SlotKind[] = [
  "gap",
  "lamp",
  "fountain",
  "lamp",
  "bench",
  "gap",
  "tree",
  "bench",
  "gap",
  "lamp",
  "tree",
  "bench",
];

const BOARD_H = 9; // 6-row panel + 3-row legs, so figures stand below it
const BOARD_MIN_W = 22;
const BOARD_MAX_W = 34;

// ─── Deterministic randomness ────────────────────────────────────────────────

function hash(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 0x01000193);
    h ^= h >>> 15;
  }
  // murmur3 finaliser for good avalanche on small integer keys
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Stable pseudo-random number in [0, 1) for the given key. */
function rand(...parts: number[]): number {
  return hash(...parts) / 4294967296;
}

// ─── Text helpers ────────────────────────────────────────────────────────────

const ELLIPSIS = "…";

const graphemeSegmenter =
  typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** User-perceived characters, so "é" or a flag is one unit, not 2–4. */
export function graphemes(text: string): string[] {
  return graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(text), (s) => s.segment)
    : Array.from(text);
}

/** East Asian wide / fullwidth ranges render as two monospace cells. */
function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/** Monospace cells a grapheme occupies (1 or 2). */
export function cellWidth(grapheme: string): number {
  const cp = grapheme.codePointAt(0) ?? 0;
  return isWide(cp) ? 2 : 1;
}

export function textWidth(text: string): number {
  return graphemes(text).reduce((sum, g) => sum + cellWidth(g), 0);
}

/**
 * Board text: drop emoji (their rendered width is font-dependent and would
 * break the panel's right edge) and collapse the leftover whitespace.
 */
export function toBoardText(text: string): string {
  return text
    .replace(
      /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}\u200d\ufe0e\ufe0f\u20e3]/gu,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Longest prefix of `text` that fits in `width` cells. */
function cut(text: string, width: number): string {
  let out = "";
  let used = 0;
  for (const g of graphemes(text)) {
    const w = cellWidth(g);
    if (used + w > width) break;
    out += g;
    used += w;
  }
  return out;
}

function withEllipsis(text: string, width: number): string {
  return textWidth(text) + 1 <= width
    ? text + ELLIPSIS
    : cut(text, Math.max(0, width - 1)) + ELLIPSIS;
}

/**
 * Word-wrap `text` into at most `maxLines` lines of `width` cells. Overflow
 * ends in an ellipsis; words longer than a line are hard-cut. Widths are
 * measured in monospace cells per grapheme.
 */
export function wrapText(
  text: string,
  width: number,
  maxLines: number,
): string[] {
  if (width <= 0 || maxLines <= 0) return [];
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let truncated = false;

  for (const raw of words) {
    const word = textWidth(raw) > width ? cut(raw, width) : raw;
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate) <= width) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) {
      truncated = true;
      break;
    }
  }
  if (!truncated && current) {
    if (lines.length < maxLines) lines.push(current);
    else truncated = true;
  }
  if (truncated && lines.length > 0) {
    lines[lines.length - 1] = withEllipsis(lines[lines.length - 1]!, width);
  }
  return lines;
}

function fit(text: string, width: number): string {
  if (width <= 0) return "";
  return textWidth(text) <= width
    ? text
    : withEllipsis(cut(text, width), width);
}

// ─── Grid ────────────────────────────────────────────────────────────────────

const LAYER_NAMES = ["far", "scenery", "people", "accent"] as const;

class Grid {
  private chars: string[][];
  private owner: (SceneLayer | null)[][];
  /** Cells covered by front-line props; back-lane figures pass behind them. */
  private front: boolean[][];

  constructor(
    readonly cols: number,
    readonly rows: number,
    private readonly safe: CellRect | null,
  ) {
    this.chars = Array.from({ length: rows }, () =>
      Array<string>(cols).fill(" "),
    );
    this.owner = Array.from({ length: rows }, () =>
      Array<SceneLayer | null>(cols).fill(null),
    );
    this.front = Array.from({ length: rows }, () =>
      Array<boolean>(cols).fill(false),
    );
  }

  isSafe(x: number, y: number): boolean {
    const s = this.safe;
    return !!s && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h;
  }

  /** True when the rectangle is fully on-grid and clear of the safe zone. */
  canPlace(x: number, y: number, w: number, h: number): boolean {
    if (x < 0 || y < 0 || x + w > this.cols || y + h > this.rows) return false;
    const s = this.safe;
    if (!s) return true;
    return x + w <= s.x || x >= s.x + s.w || y + h <= s.y || y >= s.y + s.h;
  }

  isFront(x: number, y: number): boolean {
    return !!this.front[y]?.[x];
  }

  isEmpty(x: number, y: number): boolean {
    return this.owner[y]?.[x] === null && this.chars[y]?.[x] === " ";
  }

  put(
    x: number,
    y: number,
    ch: string,
    layer: SceneLayer,
    opts?: { front?: boolean; behindFront?: boolean },
  ): void {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    if (this.isSafe(x, y)) return;
    if (opts?.behindFront && this.front[y]![x]) return;
    this.chars[y]![x] = ch;
    // "" is the trailing half of a wide glyph: owned, but prints nothing.
    this.owner[y]![x] = ch === " " ? null : layer;
    if (opts?.front) this.front[y]![x] = true;
  }

  /**
   * Write text by grapheme. A wide glyph owns its cell and the next one is
   * left empty ("") so the row keeps its visual width.
   */
  text(
    x: number,
    y: number,
    s: string,
    layer: SceneLayer,
    opts?: { front?: boolean },
  ): void {
    let col = x;
    for (const g of graphemes(s)) {
      const w = cellWidth(g);
      this.put(col, y, g, layer, opts);
      if (w === 2) this.put(col + 1, y, "", layer, opts);
      col += w;
    }
  }

  /**
   * Draw a sprite. Spaces outside each line's first..last glyph are
   * transparent; spaces inside are opaque so a thing hides what is behind it.
   */
  sprite(
    x: number,
    y: number,
    lines: readonly string[],
    layer: SceneLayer,
    opts?: { front?: boolean; behindFront?: boolean },
  ) {
    lines.forEach((line, dy) => {
      const first = line.search(/\S/);
      if (first < 0) return;
      const last = line.trimEnd().length - 1;
      for (let i = first; i <= last; i++)
        this.put(x + i, y + dy, line[i]!, layer, opts);
    });
  }

  copyRowsFrom(other: Grid, rows: readonly number[]): void {
    for (const y of rows) {
      this.chars[y] = [...other.chars[y]!];
      this.owner[y] = [...other.owner[y]!];
      this.front[y] = [...other.front[y]!];
    }
  }

  row(y: number, layer: SceneLayer): string {
    let out = "";
    for (let x = 0; x < this.cols; x++) {
      out += this.owner[y]![x] === layer ? this.chars[y]![x]! : " ";
    }
    return out;
  }

  layers(): Record<SceneLayer, string[]> {
    const out: Record<SceneLayer, string[]> = {
      far: [],
      scenery: [],
      people: [],
      accent: [],
    };
    for (let y = 0; y < this.rows; y++) {
      for (const layer of LAYER_NAMES) out[layer].push(this.row(y, layer));
    }
    return out;
  }
}

// ─── Layout ──────────────────────────────────────────────────────────────────
//
// Oblique 2.5D. Two walking lines run across the square:
//   street (back) — every building and tree stands on it; passers-by
//   front         — gatherings, fountain, benches, lamps and the board
// The floor between them recedes toward a vanishing point above the square.
// Depth is drawn as the back outline shifted right DEPTH_X / up DEPTH_Y.

const DEPTH_X = 2;
const DEPTH_Y = 1;

interface Placed {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PlacedProp extends Placed {
  kind: PropKind;
}

interface House extends Placed {
  steps: number;
  /** Optional distant rooftop peeking out behind this house. */
  far: Placed | null;
}

interface PlazaLayout {
  /** Front line: feet row of the gathering groups and front props. */
  front: number;
  /** Back line: base row of every building; feet row of passers-by. */
  street: number;
  board: Placed | null;
  props: PlacedProp[];
  houses: House[];
  /** Centre columns where groups gather, in priority order. */
  spots: number[];
}

const MAX_SPOTS = 4;
const SPOT_HALF_WIDTH = 7;

/** Props that stand on the back street (trees); the rest use the front line. */
const STREET_PROPS = new Set<PropKind>(["tree"]);

function floorDepth(rows: number): number {
  return rows >= 24 ? 4 : 3;
}

function layoutPlaza(grid: Grid, seed: number): PlazaLayout {
  const { cols, rows } = grid;
  const front = rows - 2;
  const street = front - floorDepth(rows);
  const props: PlacedProp[] = [];
  const spotCandidates: number[] = [];

  let board: Placed | null = null;
  const bw = Math.min(
    cols - 4,
    Math.max(BOARD_MIN_W, Math.min(BOARD_MAX_W, Math.round(cols * 0.22))),
  );
  if (bw >= 16 && front - BOARD_H + 1 >= 0) {
    const candidate = {
      x: cols - 2 - bw,
      y: front - BOARD_H + 1,
      w: bw,
      h: BOARD_H,
    };
    if (grid.canPlace(candidate.x, candidate.y, candidate.w, candidate.h)) {
      board = candidate;
      spotCandidates.push(candidate.x + Math.floor(bw / 2));
    }
  }

  // Props, right to left from the board.
  let cursor = (board ? board.x : cols) - 3;
  let i = 0;
  while (cursor > 1 && i < 64) {
    const kind = PROP_SEQUENCE[i % PROP_SEQUENCE.length]!;
    i++;
    const { w } = PROP_SIZE[kind];
    const h =
      kind === "lamp" && rows < 24 ? LAMP_SHORT.length : PROP_SIZE[kind].h;
    const x = cursor - w;
    const base = kind !== "gap" && STREET_PROPS.has(kind) ? street : front;
    const y = base - h + 1;
    if (x < 1) break;
    if (y >= 0 && grid.canPlace(x, y, w, h + (base === street ? 2 : 0))) {
      if (kind === "gap") spotCandidates.push(x + Math.floor(w / 2));
      else props.push({ kind, x, y, w, h });
      cursor = x - 3 - Math.floor(rand(seed, 7, i) * 4);
    } else {
      cursor -= 2;
    }
  }

  // Houses line the street. The whole volume (front face, receding side,
  // roof, cast shadow) must stay clear of the copy.
  const houses: House[] = [];
  // Keep facades clear of the board, the fountain and street trees, so
  // every outline stays readable.
  const noHouse: Placed[] = [
    ...(board ? [board] : []),
    ...props.filter((p) => STREET_PROPS.has(p.kind) || p.kind === "fountain"),
  ];
  let right = cols - 1 - DEPTH_X - Math.floor(rand(seed, 9) * 3);
  let n = 0;
  while (right > 8 && n < 40) {
    n++;
    const steps = rand(seed, 11, n) < 0.5 ? 1 : 2;
    const w = 4 * steps + 5;
    const want = 8 + Math.floor(rand(seed, 13, n) * 8);
    const h = Math.min(want, street - DEPTH_Y);
    const x = right - w + 1;
    const y = street - h + 1;
    if (x < 0) break;
    const clearOfBoard = noHouse.every(
      (t) => x + w + DEPTH_X + 1 <= t.x - 1 || x >= t.x + t.w + 1,
    );
    const fits =
      h >= 2 * steps + 5 &&
      clearOfBoard &&
      grid.canPlace(x, y - DEPTH_Y, w + DEPTH_X + 2, h + DEPTH_Y + 2);
    if (fits) {
      // A taller building one block back, only ever seen above this house.
      let far: Placed | null = null;
      const farRise = 2 + Math.floor(rand(seed, 41, n) * 4);
      const farY = y - DEPTH_Y - farRise;
      if (rand(seed, 43, n) < 0.6 && farY >= 0) {
        const farW = Math.max(5, w - 2 - Math.floor(rand(seed, 47, n) * 3));
        const farX = x + 1 + Math.floor(rand(seed, 53, n) * (w - farW));
        if (grid.canPlace(farX, farY, farW + DEPTH_X, y + 2 - farY)) {
          far = { x: farX, y: farY, w: farW, h: y + 2 - farY };
        }
      }
      houses.push({ x, y, w, h, steps, far });
      right = x - DEPTH_X - 4 - Math.floor(rand(seed, 17, n) * 6);
    } else {
      right -= 2;
    }
  }

  const spots: number[] = [];
  for (const c of spotCandidates) {
    if (spots.length >= MAX_SPOTS) break;
    const left = c - SPOT_HALF_WIDTH;
    if (left < 0 || c + SPOT_HALF_WIDTH >= cols) continue;
    if (
      !grid.canPlace(left, front - FIGURE_H + 1, 2 * SPOT_HALF_WIDTH, FIGURE_H)
    )
      continue;
    if (spots.some((s) => Math.abs(s - c) < 2 * SPOT_HALF_WIDTH + 2)) continue;
    spots.push(c);
  }

  return { front, street, board, props, houses, spots };
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

/** Stepped-gable outline (optionally with windows and a door). */
function drawGableFace(
  grid: Grid,
  house: Pick<House, "x" | "y" | "w" | "h" | "steps">,
  layer: SceneLayer,
  detailed: boolean,
) {
  const { x, y, w, h, steps } = house;
  const cx = x + Math.floor(w / 2);
  grid.text(cx - 1, y, "___", layer);
  for (let k = 0; k < steps; k++) {
    const d = 2 + 2 * k;
    grid.put(cx - d, y + 1 + 2 * k, "|", layer);
    grid.put(cx + d, y + 1 + 2 * k, "|", layer);
    grid.text(cx - d - 1, y + 2 + 2 * k, "_|", layer);
    grid.text(cx + d, y + 2 + 2 * k, "|_", layer);
    for (let fill = cx - d + 1; fill < cx + d; fill++) {
      grid.put(fill, y + 1 + 2 * k, " ", layer);
      grid.put(fill, y + 2 + 2 * k, " ", layer);
    }
  }
  const bodyTop = y + 1 + 2 * steps;
  for (let row = bodyTop; row < y + h; row++) {
    grid.put(x, row, "|", layer);
    grid.put(x + w - 1, row, "|", layer);
    for (let col = x + 1; col < x + w - 1; col++)
      grid.put(col, row, " ", layer);
  }
  for (let col = x + 1; col < x + w - 1; col++)
    grid.put(col, y + h - 1, "_", layer);
  if (!detailed) return;

  if (steps === 2) grid.put(cx, y + 2, "o", layer);
  const doorTop = y + h - 3;
  for (let row = bodyTop + 1; row < doorTop; row += 2) {
    for (let col = x + 2; col + 1 < x + w - 2; col += 4) {
      grid.text(col, row, "[]", layer);
    }
  }
  // Door at street level with a step in front of it.
  grid.text(cx - 1, doorTop, ".-.", layer);
  grid.text(cx - 1, doorTop + 1, "| |", layer);
  grid.text(cx - 1, doorTop + 2, "|_|", layer);
}

/**
 * A house with volume: back outline (shifted by the depth vector), corner
 * connectors, a shaded side face, then the opaque front face on top.
 */
function drawHouse(grid: Grid, house: House, street: number) {
  const { x, y, w, h, steps } = house;
  const cx = x + Math.floor(w / 2);
  const right = x + w - 1;
  const bodyTop = y + 1 + 2 * steps;

  if (house.far) {
    // Its walls run down behind the house body (which is drawn later and
    // hides them), so it reads as standing behind — never floating.
    const f = house.far;
    const visibleBottom = y - DEPTH_Y + 2 * steps + 1;
    grid.text(f.x, f.y, "_".repeat(f.w), "far");
    grid.put(f.x + f.w, f.y, "/", "far");
    for (let r = f.y + 1; r <= visibleBottom; r++) {
      grid.put(f.x, r, "|", "far");
      grid.put(f.x + f.w - 1, r, "|", "far");
      if (r - 1 > f.y) grid.put(f.x + f.w + 1, r - 1, "|", "far");
      for (let c = f.x + 1; c < f.x + f.w - 1; c++) {
        grid.put(
          c,
          r,
          (r - f.y) % 2 === 0 && (c - f.x) % 3 === 1 ? "." : " ",
          "far",
        );
      }
    }
  }

  // Back face: same silhouette, pushed into the depth.
  drawGableFace(
    grid,
    { x: x + DEPTH_X, y: y - DEPTH_Y, w, h, steps },
    "scenery",
    false,
  );
  // Side face shading between the front and back right walls.
  for (let r = bodyTop + 1; r < street; r++) {
    for (let c = right + 1; c < right + DEPTH_X; c++) {
      grid.put(c, r, r % 2 === 0 ? ":" : " ", "scenery");
    }
  }
  // Corner connectors (receding edges).
  grid.put(cx + 2, y, "/", "scenery");
  for (let k = 0; k < steps; k++) {
    grid.put(cx + 3 + 2 * k + 1, y + 2 + 2 * k, "/", "scenery");
  }
  grid.put(right + 1, bodyTop, "/", "scenery");
  grid.put(right + 1, street, "/", "scenery");

  drawGableFace(grid, house, "scenery", true);

  // Cast shadow on the paving (light from the upper left): light dots
  // under the facade, denser just past the receding side.
  for (let c = x + 2; c <= right + DEPTH_X + 2; c++) {
    const near = c > right && c <= right + DEPTH_X + 1;
    if (near) grid.put(c, street + 1, ":", "scenery");
    else if ((c - x) % 2 === 0) grid.put(c, street + 1, ".", "scenery");
  }
}

/** Paving: street line, perspective seams and denser tiles toward the back. */
function drawFloor(
  grid: Grid,
  layout: Pick<PlazaLayout, "front" | "street">,
  seed: number,
) {
  const { cols, rows } = grid;
  const { front, street } = layout;
  for (let x = 0; x < cols; x++) grid.put(x, street, "_", "scenery");

  // Tile rows: every other cell just in front of the street, sparser
  // further forward — the square reads as a floor, not a line.
  for (let y = street + 1; y < front; y++) {
    const step = 4 + (y - street - 1) * 3;
    for (let x = (y * 3) % step; x < cols; x += step) {
      grid.put(x, y, ".", "scenery");
    }
  }

  // Seams receding to a vanishing point above the middle of the square.
  const vx = cols / 2;
  const vy = street - 14;
  for (let bx = 6; bx < cols; bx += 12) {
    for (let y = street + 1; y < rows; y++) {
      const t = (y - vy) / (street - vy);
      const x = Math.round(vx + (bx - vx) * t);
      const ch = Math.abs(bx - vx) < 3 ? "|" : bx < vx ? "/" : "\\";
      grid.put(x, y, ch, "scenery");
    }
  }

  // Front edge and a little wear on it.
  for (let x = 0; x < cols; x++) {
    grid.put(x, front, "_", "scenery");
    if (front + 1 < rows && rand(seed, 3, x) < 0.12) {
      grid.put(x, front + 1, rand(seed, 5, x) < 0.5 ? "." : "'", "scenery");
    }
  }
}

/** The moving parts of a fountain: spray and rippling water. */
function drawFountainWater(grid: Grid, prop: PlacedProp, tick: number) {
  const phase = Math.floor(tick / 3) % 2;
  const [s0, s1] = FOUNTAIN_SPRAY[phase]!;
  grid.sprite(prop.x, prop.y, [s0, s1], "scenery", { front: true });
  grid.sprite(prop.x, prop.y + 3, [FOUNTAIN_WATER[phase]!], "scenery", {
    front: true,
  });
}

function fountainRows(prop: PlacedProp): number[] {
  return [prop.y, prop.y + 1, prop.y + 3];
}

/** Static parts of a prop (everything that does not move). */
function drawProp(grid: Grid, prop: PlacedProp) {
  const front = !STREET_PROPS.has(prop.kind);
  const opts = { front };
  switch (prop.kind) {
    case "fountain": {
      grid.sprite(prop.x, prop.y + 2, [FOUNTAIN_BASE[0]], "scenery", opts);
      grid.sprite(prop.x, prop.y + 4, [FOUNTAIN_BASE[2]], "scenery", opts);
      // Reserve the spray/water cells as front so passers-by go behind.
      for (const r of [prop.y, prop.y + 1, prop.y + 3]) {
        for (let c = prop.x; c < prop.x + prop.w; c++) {
          if (grid.isEmpty(c, r)) grid.put(c, r, " ", "scenery", opts);
        }
      }
      grid.text(prop.x + 3, prop.y + 5, ". . .", "scenery");
      return;
    }
    case "lamp":
      grid.sprite(
        prop.x,
        prop.y,
        prop.h === LAMP_SHORT.length ? LAMP_SHORT : LAMP,
        "scenery",
        opts,
      );
      grid.text(prop.x + 2, prop.y + prop.h, "..", "scenery");
      return;
    case "bench":
      grid.sprite(prop.x, prop.y, BENCH, "scenery", opts);
      return;
    case "tree":
      grid.sprite(prop.x, prop.y, TREE, "scenery");
      grid.text(prop.x + 4, prop.y + prop.h, ":.", "scenery");
      return;
  }
}

function boardText(board: NoticeBoardContent, inner: number) {
  const label = fit(toBoardText(board.label).toUpperCase(), inner - 2);
  const body =
    board.kind === "event"
      ? [
          ...wrapText(toBoardText(board.title), inner, 2),
          fit(toBoardText(board.when), inner),
        ]
      : wrapText(toBoardText(board.message), inner, 3);
  while (body.length < 3) body.push("");
  return { label, body: body.slice(0, 3) };
}

function drawBoard(
  grid: Grid,
  at: Placed,
  content: NoticeBoardContent,
): string[] {
  const { x, y, w } = at;
  const inner = w - 4;
  const edge = "-".repeat(w - 2);
  const opts = { front: true };
  grid.text(x, y, `.${edge}.`, "scenery", opts);
  for (let r = 1; r <= 4; r++) {
    grid.text(x, y + r, `|${" ".repeat(w - 2)}|`, "scenery", opts);
  }
  grid.text(x, y + 5, `'${edge}'`, "scenery", opts);
  const legL = x + 3;
  const legR = x + w - 5;
  for (const r of [6, 7, 8]) {
    grid.text(legL, y + r, "||", "scenery", opts);
    grid.text(legR, y + r, "||", "scenery", opts);
  }

  const { label, body } = boardText(content, inner);
  // Orange is the pin only; 12px orange text would fail contrast (≈2.9:1).
  grid.put(x + 2, y + 1, "*", "accent", opts);
  grid.text(x + 4, y + 1, label, "people", opts);
  body.forEach((line, i) => grid.text(x + 2, y + 2 + i, line, "people", opts));
  return [label, ...body.filter(Boolean)];
}

// ─── Choreography ────────────────────────────────────────────────────────────

interface GroupPlan {
  members: FigureKind[];
  enterFromLeft: boolean[];
  exitToLeft: boolean[];
}

/** Group sizes of 2–3, always mixing humans and agents as peers. */
function planGroup(
  seed: number,
  spot: number,
  cycle: number,
  cols: number,
): GroupPlan {
  const size = rand(seed, 19, spot, cycle) < 0.55 ? 3 : 2;
  const members: FigureKind[] = ["human", "agent"];
  if (size === 3) {
    members.push(rand(seed, 23, spot, cycle) < 0.5 ? "human" : "agent");
  }
  // Deterministic shuffle so kinds are not always in the same order.
  for (let i = members.length - 1; i > 0; i--) {
    const j = Math.floor(rand(seed, 29, spot, cycle, i) * (i + 1));
    [members[i], members[j]] = [members[j]!, members[i]!];
  }
  const nearLeft = spot < cols / 2;
  return {
    members,
    enterFromLeft: members.map((_, i) =>
      rand(seed, 31, spot, cycle, i) < 0.8 ? nearLeft : !nearLeft,
    ),
    exitToLeft: members.map((_, i) => rand(seed, 37, spot, cycle, i) < 0.5),
  };
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * Math.min(1, Math.max(0, t)));
}

/** Passers-by on the back street: one human, one agent, opposite ways. */
const PASSERS: { kind: FigureKind; leftToRight: boolean; offset: number }[] = [
  { kind: "human", leftToRight: true, offset: 0 },
  { kind: "agent", leftToRight: false, offset: 170 },
];
const PASS_TICKS_PER_CELL = 2;

function figuresAt(
  tick: number,
  cols: number,
  layout: PlazaLayout,
  seed: number,
): FigureSnapshot[] {
  const out: FigureSnapshot[] = [];
  const y = layout.front - FIGURE_H + 1;
  const offLeft = -FIGURE_W - 1;
  const offRight = cols + 1;

  PASSERS.forEach((p, i) => {
    const span = cols + 2 * (FIGURE_W + 1);
    const period = span * PASS_TICKS_PER_CELL + 120;
    const t = (((tick + p.offset) % period) + period) % period;
    const along = Math.floor(t / PASS_TICKS_PER_CELL);
    if (along >= span) return;
    out.push({
      id: `p${i}`,
      kind: p.kind,
      group: -1,
      phase: "passing",
      depth: "back",
      x: p.leftToRight ? offLeft + along : offRight - along,
      y: layout.street - FIGURE_H + 1,
    });
  });

  layout.spots.forEach((spotX, s) => {
    const shifted = tick - s * SPOT_OFFSET;
    const cycle = Math.floor(shifted / TOWN_SQUARE_CYCLE);
    const t = shifted - cycle * TOWN_SQUARE_CYCLE;
    const plan = planGroup(seed, spotX, cycle, cols);
    const n = plan.members.length;

    plan.members.forEach((kind, i) => {
      const slotX = spotX - 1 + Math.round((i - (n - 1) / 2) * (FIGURE_W + 2));
      const arriveStart = i * STAGGER;
      const arriveEnd = arriveStart + WALK_IN;
      const leaveStart = (n - 1) * STAGGER + WALK_IN + STAND + i * STAGGER;
      const exitX = plan.exitToLeft[i] ? offLeft : offRight;
      const leaveDuration = Math.max(
        LEAVE_BUDGET / 2,
        Math.min(LEAVE_BUDGET, Math.abs(exitX - slotX)),
      );
      const enterX = plan.enterFromLeft[i] ? offLeft : offRight;

      let phase: FigurePhase;
      let x: number;
      if (t < arriveStart) return;
      if (t < arriveEnd) {
        phase = "arriving";
        x = lerp(enterX, slotX, (t - arriveStart) / WALK_IN);
      } else if (t < leaveStart) {
        phase = "gathered";
        x = slotX;
      } else if (t < leaveStart + leaveDuration) {
        phase = "leaving";
        x = lerp(slotX, exitX, (t - leaveStart) / leaveDuration);
      } else {
        return;
      }
      out.push({
        id: `${s}:${cycle}:${i}`,
        kind,
        group: s,
        phase,
        depth: "front",
        x,
        y,
      });
    });
  });
  return out;
}

function figureSprite(f: FigureSnapshot, tick: number, index: number) {
  const walking = f.phase !== "gathered";
  const step = walking && tick % 2 === 1;
  if (f.kind === "agent") {
    const blink = !walking && Math.floor((tick + index * 5) / 9) % 7 === 0;
    return [blink ? AGENT_BLINK : AGENT_HEAD, BODY, step ? LEGS_STEP : LEGS];
  }
  const wave = !walking && Math.floor((tick + index * 7) / 20) % 4 === 0;
  return [
    wave ? HUMAN_WAVE : HUMAN_HEAD,
    wave ? BODY_WAVE : BODY,
    step ? LEGS_STEP : LEGS,
  ];
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export interface TownSquareScene {
  cols: number;
  rows: number;
  /** Board panel in cells, or null when it did not fit. */
  board: CellRect | null;
  boardLines: string[];
  /** Base row of every building and the back walking line. */
  street: number;
  /** Feet row of the gathering groups. */
  front: number;
  buildings: BuildingRect[];
  frame(tick: number): TownSquareFrame;
}

/**
 * Build the square once for a size + data: layout and every static cell are
 * computed here. `frame(tick)` then redraws only the rows where something
 * moves (both walking lines and the fountain water) and reuses cached
 * strings for every other row.
 */
export function createTownSquare(
  cols: number,
  rows: number,
  data: TownSquareData,
): TownSquareScene {
  const safeCols = Math.max(0, Math.floor(cols));
  const safeRows = Math.max(0, Math.floor(rows));
  const seed = data.seed ?? 1;
  const base = new Grid(safeCols, safeRows, data.safeZone ?? null);

  if (safeCols < 8 || safeRows < 8) {
    const layers = base.layers();
    return {
      cols: safeCols,
      rows: safeRows,
      board: null,
      boardLines: [],
      street: -1,
      front: -1,
      buildings: [],
      frame: () => ({
        cols: safeCols,
        rows: safeRows,
        layers,
        figures: [],
        boardLines: [],
        board: null,
      }),
    };
  }

  const layout = layoutPlaza(base, seed);
  drawFloor(base, layout, seed);
  // Back to front: houses on the street, street props, then front props.
  for (const house of layout.houses) drawHouse(base, house, layout.street);
  for (const prop of layout.props)
    if (STREET_PROPS.has(prop.kind)) drawProp(base, prop);
  for (const prop of layout.props)
    if (!STREET_PROPS.has(prop.kind)) drawProp(base, prop);
  const boardLines = layout.board
    ? drawBoard(base, layout.board, data.board)
    : [];
  const board = layout.board
    ? { x: layout.board.x, y: layout.board.y, w: layout.board.w, h: 6 }
    : null;
  const buildings: BuildingRect[] = layout.houses.map((h) => ({
    x: h.x,
    y: h.y,
    w: h.w,
    h: h.h,
    base: h.y + h.h - 1,
  }));

  const fountains = layout.props.filter((p) => p.kind === "fountain");
  const lane = (feet: number) =>
    Array.from({ length: FIGURE_H }, (_, i) => feet - FIGURE_H + 1 + i);
  const dynamicRows = [
    ...new Set([
      ...lane(layout.street),
      ...lane(layout.front),
      ...fountains.flatMap(fountainRows),
    ]),
  ].filter((y) => y >= 0 && y < safeRows);
  const dynamic = new Set(dynamicRows);

  const staticLayers = base.layers();
  const work = new Grid(safeCols, safeRows, data.safeZone ?? null);

  return {
    cols: safeCols,
    rows: safeRows,
    board,
    boardLines,
    street: layout.street,
    front: layout.front,
    buildings,
    frame(tick: number): TownSquareFrame {
      work.copyRowsFrom(base, dynamicRows);
      for (const f of fountains) drawFountainWater(work, f, tick);
      const figures = figuresAt(tick, safeCols, layout, seed);
      figures.forEach((f, i) => {
        const sprite = figureSprite(f, tick, i);
        if (f.depth === "back") {
          // Fainter, and hidden behind anything standing on the front line.
          work.sprite(f.x, f.y, sprite, "scenery", { behindFront: true });
        } else {
          work.sprite(f.x, f.y, sprite, "people");
        }
      });

      const layers: Record<SceneLayer, string[]> = {
        far: [],
        scenery: [],
        people: [],
        accent: [],
      };
      for (let y = 0; y < safeRows; y++) {
        for (const layer of LAYER_NAMES) {
          layers[layer].push(
            dynamic.has(y) ? work.row(y, layer) : staticLayers[layer][y]!,
          );
        }
      }
      return {
        cols: safeCols,
        rows: safeRows,
        layers,
        figures,
        boardLines,
        board,
      };
    },
  };
}

/** One-shot convenience: build the square and render a single tick. */
export function renderTownSquare(
  tick: number,
  cols: number,
  rows: number,
  data: TownSquareData,
): TownSquareFrame {
  return createTownSquare(cols, rows, data).frame(tick);
}
