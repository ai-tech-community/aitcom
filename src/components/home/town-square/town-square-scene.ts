/**
 * The homepage "town square": an original ASCII plaza where people and AI
 * agents walk in, gather in small mixed groups and drift away again.
 *
 * Pure frame function — no DOM, no clock, no Math.random. Everything is a
 * deterministic function of `(tick, cols, rows, data)`, so any frame can be
 * reproduced in tests and the reduced-motion frame is just a chosen tick.
 *
 * Art: original work drawn for AIT Community (no third-party pieces), so no
 * artist initials are embedded. Sourced art would keep its artist's
 * initials inside the piece, per the ASCII art community convention.
 *
 * Output is layered so the renderer can colour by CSS tokens:
 * - `scenery` — houses, props, pavement (quiet)
 * - `people`  — figures and notice-board text (stronger)
 * - `glow`    — lit windows, lamps and stars once night falls
 * - `accent`  — the notice-board marker + label (the one orange accent)
 * Every cell belongs to at most one layer.
 *
 * Hidden play effects (wave, night, splash) are frame *input*: their state
 * lives in `town-square-effects.ts` and is passed to `frame(tick, effects)`;
 * `targetAt` maps a cell to the object a click would play with.
 */

import type { CellRect } from "@/components/ascii/measure";
import {
  FIGURE_H,
  FIGURE_W,
  figure,
  type FigureKind,
} from "@/components/ascii/figures";
import {
  DEPTH_X,
  DEPTH_Y,
  drawHouse,
  type GableHouse,
} from "@/components/ascii/gabled-house";
import {
  cellWidth,
  graphemes,
  textCells,
  textWidth,
} from "@/components/ascii/cells";
import { placeStars } from "@/components/ascii/night-sky";
import { rand } from "@/components/ascii/seeded";
import { TREE } from "@/components/ascii/street-props";
import {
  GREET_REPLY_DELAY,
  NO_EFFECTS,
  SPLASH_BURST_TICKS,
  greetReplying,
  greetStage,
  greetingText,
  nightLevel,
  splashBurstAge,
  splashGather,
  waveArmUp,
  type GreetStage,
  type SquareTarget,
  type SquareTargetKind,
  type TownSquareEffects,
} from "./town-square-effects";

export type NoticeBoardContent =
  | { kind: "event"; label: string; title: string; when: string }
  | { kind: "empty"; label: string; message: string };

export interface TownSquareData {
  /**
   * What the notice board says. Null draws the square without a board, so
   * nothing lands on the `accent` layer (e.g. a closing strip that must not
   * spend the page's orange).
   */
  board: NoticeBoardContent | null;
  /** Cells the scene must never draw into (the headline + copy column). */
  safeZone?: CellRect | null;
  seed?: number;
  /**
   * What an agent says when someone waves at it; rotates per wave.
   * `{name}` becomes the agent's name. Translated by the caller.
   */
  greetings?: readonly string[];
}

/**
 * Back to front: `far` (distant rooftops, faintest), `scenery` (square,
 * houses, props, back-lane passers-by), `people` (front groups + board
 * text), `glow` (night lights — full foreground, never orange), `accent`
 * (the board pin, the one orange).
 */
export type SceneLayer = "far" | "scenery" | "people" | "glow" | "accent";

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
  /** How far night has fallen, 0 (day) to 1 (night): drives the sky tint. */
  night: number;
}

/** A target the keyboard controls can play with, and from which tick. */
export interface SuggestedTarget {
  target: SquareTarget;
  /**
   * Tick the target is on stage: the current tick, or later when the next
   * agent is still walking in (see `suggestTarget`'s `lookahead`).
   */
  at: number;
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

// ─── Text helpers ────────────────────────────────────────────────────────────

const ELLIPSIS = "…";

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

const LAYER_NAMES = ["far", "scenery", "people", "glow", "accent"] as const;

function emptyLayers(): Record<SceneLayer, string[]> {
  return { far: [], scenery: [], people: [], glow: [], accent: [] };
}

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

  /** True when nothing at all is drawn here (not even an opaque space). */
  isBlank(x: number, y: number): boolean {
    return this.isEmpty(x, y) && !this.front[y]?.[x];
  }

  charAt(x: number, y: number): string {
    return this.chars[y]?.[x] ?? "";
  }

  clone(): Grid {
    const copy = new Grid(this.cols, this.rows, this.safe);
    copy.copyRowsFrom(
      this,
      Array.from({ length: this.rows }, (_, y) => y),
    );
    return copy;
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
    for (const [col, g] of textCells(x, s)) this.put(col, y, g, layer, opts);
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
    const out = emptyLayers();
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

interface Cell {
  x: number;
  y: number;
}

interface PlacedProp extends CellRect {
  kind: PropKind;
}

interface PlazaLayout {
  /** Front line: feet row of the gathering groups and front props. */
  front: number;
  /** Back line: base row of every building; feet row of passers-by. */
  street: number;
  board: CellRect | null;
  props: PlacedProp[];
  houses: GableHouse[];
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

function layoutPlaza(
  grid: Grid,
  seed: number,
  withBoard: boolean,
): PlazaLayout {
  const { cols, rows } = grid;
  const front = rows - 2;
  const street = front - floorDepth(rows);
  const props: PlacedProp[] = [];
  const spotCandidates: number[] = [];

  let board: CellRect | null = null;
  const bw = Math.min(
    cols - 4,
    Math.max(BOARD_MIN_W, Math.min(BOARD_MAX_W, Math.round(cols * 0.22))),
  );
  if (withBoard && bw >= 16 && front - BOARD_H + 1 >= 0) {
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
  const houses: GableHouse[] = [];
  // Keep facades clear of the board, the fountain and street trees, so
  // every outline stays readable.
  const noHouse: CellRect[] = [
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
      let far: CellRect | null = null;
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
  at: CellRect,
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

/** A wave: arm up or out, toward `side`. */
interface Wave {
  side: "left" | "right";
  armUp: boolean;
}

interface Pose {
  walking: boolean;
  wave: Wave | null;
}

function figureSprite(
  f: FigureSnapshot,
  tick: number,
  index: number,
  pose: Pose,
): string[] {
  const { walking, wave } = pose;
  if (wave) {
    return figure(f.kind, tick, {
      walking,
      arm: wave.armUp ? "up" : "out",
      side: wave.side,
    });
  }
  if (f.kind === "agent") {
    const blink = !walking && Math.floor((tick + index * 5) / 9) % 7 === 0;
    return figure("agent", tick, { walking, blink });
  }
  const idleWave = !walking && Math.floor((tick + index * 7) / 20) % 4 === 0;
  return figure("human", tick, { walking, arm: idleWave ? "up" : undefined });
}

// ─── Effects: night ──────────────────────────────────────────────────────────

/** One cell that changes when night falls, and the night level it needs. */
interface NightCell {
  x: number;
  y: number;
  ch: string;
  layer: SceneLayer;
  /** Visible once `nightLevel` passes this (0..1). */
  order: number;
}

const LIT_WINDOW = "##";
const LAMP_BULB_LIT = "O";
/** Light rays around a lamp head: [dx, dy, glyph] from the lamp's top-left. */
const LAMP_RAYS: [number, number, string][] = [
  [-1, 0, "\\"],
  [3, 0, "/"],
  [-1, 1, "-"],
  [3, 1, "-"],
  [-1, 2, "/"],
  [3, 2, "\\"],
];

/**
 * Everything that lights up at night, planned once from the finished day
 * grid: windows (one by one, in a seeded order), lamps (first) and a few
 * stars in the open sky above the rooftops. Only blank cells or real
 * windows are touched, so no outline is ever overwritten.
 */
function planNight(
  base: Grid,
  layout: PlazaLayout,
  windows: readonly Cell[],
  seed: number,
): NightCell[] {
  const out: NightCell[] = [];

  for (const w of windows) {
    if (base.charAt(w.x, w.y) !== "[" || base.charAt(w.x + 1, w.y) !== "]")
      continue;
    const order = 0.08 + rand(seed, 61, w.x, w.y) * 0.8;
    out.push({ x: w.x, y: w.y, ch: LIT_WINDOW[0]!, layer: "glow", order });
    out.push({ x: w.x + 1, y: w.y, ch: LIT_WINDOW[1]!, layer: "glow", order });
  }

  for (const lamp of layout.props) {
    if (lamp.kind !== "lamp") continue;
    if (base.charAt(lamp.x + 1, lamp.y + 1) === "o") {
      out.push({
        x: lamp.x + 1,
        y: lamp.y + 1,
        ch: LAMP_BULB_LIT,
        layer: "glow",
        order: 0.02,
      });
    }
    for (const [dx, dy, ch] of LAMP_RAYS) {
      const x = lamp.x + dx;
      const y = lamp.y + dy;
      if (base.isBlank(x, y) && !base.isSafe(x, y))
        out.push({ x, y, ch, layer: "glow", order: 0.04 });
    }
  }

  // Skyline: the first drawn row per column. Stars stay well above it.
  const { cols, rows } = base;
  const skyline = Array.from({ length: cols }, (_, x) => {
    for (let y = 0; y < rows; y++) if (!base.isBlank(x, y)) return y;
    return rows;
  });
  for (const star of placeStars({
    cols,
    rows,
    skyTop: Math.max(0, layout.street - 8),
    seed,
    skyline,
    isFree: (x, y) => base.isBlank(x, y) && !base.isSafe(x, y),
  })) {
    out.push({
      x: star.x,
      y: star.y,
      ch: star.ch,
      layer: "glow",
      order: 0.3 + rand(seed, 73, star.index) * 0.65,
    });
  }
  return out;
}

// ─── Effects: greeting ───────────────────────────────────────────────────────

const BUBBLE_MAX_TEXT = 30;
const BUBBLE_H = 3;

interface Bubble extends CellRect {
  text: string;
  tailX: number;
}

function overlaps(a: CellRect, b: CellRect): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/**
 * Where a speech bubble for `figure` goes: centred above its head, nudged
 * sideways to stay on the grid, off the notice board and out of the copy's
 * keep-clear zone — but always with its tail over the speaker's head. Null
 * when there is no such spot (the agent still waves).
 */
function placeBubble(
  grid: Grid,
  figure: FigureSnapshot,
  rawText: string,
  board: CellRect | null,
): Bubble | null {
  const text = fit(rawText, BUBBLE_MAX_TEXT);
  const w = textWidth(text) + 4;
  const y = figure.y - BUBBLE_H;
  if (y < 0 || w > grid.cols || !text) return null;
  const head = figure.x + 1;
  const ideal = Math.min(grid.cols - w, Math.max(0, head - Math.floor(w / 2)));
  for (let shift = 0; shift <= w; shift++) {
    for (const x of shift === 0 ? [ideal] : [ideal + shift, ideal - shift]) {
      if (x < 0 || x + w > grid.cols) continue;
      // The tail must point at the speaker, or it reads as someone else's.
      if (head < x + 1 || head > x + w - 2) continue;
      const rect = { x, y, w, h: BUBBLE_H };
      if (!grid.canPlace(x, y, w, BUBBLE_H)) continue;
      if (board && overlaps(rect, board)) continue;
      return { ...rect, text, tailX: head };
    }
  }
  return null;
}

const BUBBLE_LAYER: Record<GreetStage, SceneLayer> = {
  full: "people",
  dim: "scenery",
  faint: "far",
};

function drawBubble(grid: Grid, bubble: Bubble, stage: GreetStage) {
  const layer = BUBBLE_LAYER[stage];
  const { x, y, w, text, tailX } = bubble;
  const edge = "-".repeat(w - 2);
  grid.text(x, y, `.${edge}.`, layer);
  const pad = " ".repeat(Math.max(0, w - 4 - textWidth(text)));
  grid.text(x, y + 1, `| ${text}${pad} |`, layer);
  grid.text(x, y + 2, `'${edge}'`, layer);
  grid.put(tailX, y + 2, "v", layer);
}

// ─── Effects: fountain splash ────────────────────────────────────────────────

/** Droplets: start offset from the spout, sideways and upward speed. */
const DROPLETS: { dx: number; vx: number; vy: number }[] = [
  { dx: 0, vx: -0.25, vy: 1.3 },
  { dx: 0, vx: 0.3, vy: 1.2 },
  { dx: -1, vx: -0.6, vy: 1.05 },
  { dx: 1, vx: 0.6, vy: 1.1 },
  { dx: -2, vx: -0.95, vy: 0.8 },
  { dx: 2, vx: 0.95, vy: 0.85 },
  { dx: -3, vx: -1.25, vy: 0.55 },
  { dx: 3, vx: 1.3, vy: 0.5 },
];
const DROPLET_GRAVITY = 0.22;
/** Rows above the fountain top that flying droplets can reach. */
const SPLASH_HEADROOM = 4;

function drawDroplets(
  grid: Grid,
  fountain: PlacedProp,
  floor: number,
  age: number,
) {
  const spout = fountain.x + Math.floor(fountain.w / 2);
  for (const d of DROPLETS) {
    const x = Math.round(spout + d.dx + d.vx * age);
    const rise = d.vy * age - (DROPLET_GRAVITY * age * age) / 2;
    const y = fountain.y - Math.round(rise);
    if (y >= floor) {
      // Landed: a small wet mark on the paving in front of the fountain.
      if (grid.isEmpty(x, floor)) grid.put(x, floor, ",", "people");
      continue;
    }
    if (y < fountain.y - SPLASH_HEADROOM) continue;
    const falling = d.vy - DROPLET_GRAVITY * age < 0;
    if (grid.isEmpty(x, y)) grid.put(x, y, falling ? "." : "'", "people");
  }
}

/** Figures standing around the fountain, as sprite x positions. */
function fountainSlots(fountain: CellRect): {
  left: number[];
  right: number[];
} {
  return {
    left: [fountain.x - FIGURE_W - 1, fountain.x - 2 * FIGURE_W - 2],
    right: [
      fountain.x + fountain.w + 1,
      fountain.x + fountain.w + FIGURE_W + 2,
    ],
  };
}

const GATHER_RADIUS = 40;
const MAX_GATHERERS = 3;

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
  /** Clickable props (cells), in layout order. */
  lamps: CellRect[];
  fountains: CellRect[];
  /**
   * What this layout has to play with at all — independent of the tick, so
   * a control never appears or vanishes as figures come and go.
   */
  playable: Record<SquareTargetKind, boolean>;
  /**
   * The open sky: above the street and right of the copy's keep-clear
   * zone, so a night tint here never sits under the hero text. Null when
   * no such region exists.
   */
  sky: CellRect | null;
  /** Draw `tick`, with any play effects applied. */
  frame(tick: number, effects?: TownSquareEffects): TownSquareFrame;
  /** What a click on cell (col, row) would play with, if anything. */
  targetAt(
    col: number,
    row: number,
    tick: number,
    effects?: TownSquareEffects,
  ): SquareTarget | null;
  /**
   * A sensible target for the keyboard controls. "Wave to an agent" prefers
   * a gathered front-line agent with room for a bubble, then any agent on
   * stage (back street included), then — within `lookahead` ticks — the
   * next agent to walk on. Null only when there is truly none.
   */
  suggestTarget(
    kind: SquareTargetKind,
    tick: number,
    options?: { effects?: TownSquareEffects; lookahead?: number },
  ): SuggestedTarget | null;
}

const DEFAULT_GREETINGS = ["hi, I'm {name}"];

/** Hit boxes are one cell larger than the art: easier to click. */
const HIT_PAD = 1;

function contains(r: CellRect, col: number, row: number, pad = 0): boolean {
  return (
    col >= r.x - pad &&
    col < r.x + r.w + pad &&
    row >= r.y - pad &&
    row < r.y + r.h + pad
  );
}

/**
 * Build the square once for a size + data: layout and every static cell are
 * computed here. `frame(tick)` then redraws only the rows where something
 * moves (both walking lines and the fountain water, plus the rows an active
 * effect touches) and reuses cached strings for every other row.
 */
export function createTownSquare(
  cols: number,
  rows: number,
  data: TownSquareData,
): TownSquareScene {
  const safeCols = Math.max(0, Math.floor(cols));
  const safeRows = Math.max(0, Math.floor(rows));
  const seed = data.seed ?? 1;
  const greetings = data.greetings?.length ? data.greetings : DEFAULT_GREETINGS;
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
      lamps: [],
      fountains: [],
      playable: { agent: false, lamp: false, fountain: false },
      sky: null,
      frame: () => ({
        cols: safeCols,
        rows: safeRows,
        layers,
        figures: [],
        boardLines: [],
        board: null,
        night: 0,
      }),
      targetAt: () => null,
      suggestTarget: () => null,
    };
  }

  const layout = layoutPlaza(base, seed, data.board !== null);
  drawFloor(base, layout, seed);
  // Back to front: houses on the street, street props, then front props.
  const windows: Cell[] = [];
  for (const house of layout.houses)
    drawHouse(base, house, layout.street, windows);
  for (const prop of layout.props)
    if (STREET_PROPS.has(prop.kind)) drawProp(base, prop);
  for (const prop of layout.props)
    if (!STREET_PROPS.has(prop.kind)) drawProp(base, prop);
  const boardLines =
    layout.board && data.board ? drawBoard(base, layout.board, data.board) : [];
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
  const lamps = layout.props.filter((p) => p.kind === "lamp");
  // Fountain hit box includes the puddle row under the basin.
  const fountainBoxes = fountains.map((f) => ({ ...f, h: f.h + 1 }));
  const rect = ({ x, y, w, h }: CellRect): CellRect => ({ x, y, w, h });

  const lane = (feet: number) =>
    Array.from({ length: FIGURE_H }, (_, i) => feet - FIGURE_H + 1 + i);
  const inGrid = (y: number) => y >= 0 && y < safeRows;
  const dynamicRows = [
    ...new Set([
      ...lane(layout.street),
      ...lane(layout.front),
      ...fountains.flatMap(fountainRows),
    ]),
  ].filter(inGrid);

  const staticLayers = base.layers();
  const work = new Grid(safeCols, safeRows, data.safeZone ?? null);

  // Night is planned once; its fully-dark grid is built on first use.
  const nightCells = planNight(base, layout, windows, seed);
  const nightRows = [...new Set(nightCells.map((c) => c.y))];
  let night: { grid: Grid; layers: Record<SceneLayer, string[]> } | null = null;
  const fullNight = () => {
    if (!night) {
      const grid = base.clone();
      for (const c of nightCells) grid.put(c.x, c.y, c.ch, c.layer);
      night = { grid, layers: grid.layers() };
    }
    return night;
  };

  /**
   * Figures at `tick` with the splash detour applied: the few people
   * nearest the fountain when it splashed walk over, stand around it, then
   * walk back into their normal choreography.
   */
  const stageFigures = (tick: number, effects: TownSquareEffects) => {
    const figures = figuresAt(tick, safeCols, layout, seed);
    const walking = new Set<string>();
    const splash = effects.splash;
    const fountain = splash ? fountains[splash.fountain] : undefined;
    const weight = splashGather(splash, tick);
    if (!splash || !fountain || weight <= 0) return { figures, walking };

    const centre = fountain.x + Math.floor(fountain.w / 2);
    const feetY = layout.front - FIGURE_H + 1;
    const slots = fountainSlots(fountain);
    const free = (x: number) => base.canPlace(x, feetY, FIGURE_W, FIGURE_H);
    const left = slots.left.filter(free);
    const right = slots.right.filter(free);
    const chosen = figuresAt(splash.since, safeCols, layout, seed)
      .filter(
        (f) =>
          f.depth === "front" && Math.abs(f.x + 1 - centre) <= GATHER_RADIUS,
      )
      .sort((a, b) => Math.abs(a.x + 1 - centre) - Math.abs(b.x + 1 - centre))
      .slice(0, MAX_GATHERERS);
    const target = new Map<string, number>();
    for (const f of chosen) {
      const fromLeft = f.x + 1 < centre;
      const slot =
        (fromLeft ? left : right).shift() ?? (fromLeft ? right : left).shift();
      if (slot !== undefined) target.set(f.id, slot);
    }
    for (const f of figures) {
      const slot = target.get(f.id);
      if (slot === undefined) continue;
      f.x = lerp(f.x, slot, weight);
      if (weight < 1) walking.add(f.id);
    }
    return { figures, walking };
  };

  /** Agents on stage, front line first (they are the ones you notice). */
  const agentsOnStage = (figures: FigureSnapshot[]) => [
    ...figures.filter((f) => f.kind === "agent" && f.depth === "front"),
    ...figures.filter((f) => f.kind === "agent" && f.depth === "back"),
  ];

  const hasRoom = (f: FigureSnapshot) =>
    !!placeBubble(base, f, greetingText(f.id, 0, greetings), layout.board);

  /** Best agent to greet at `tick`, or undefined when none is on stage. */
  const bestAgent = (tick: number, effects: TownSquareEffects) => {
    // Fully in view: not half off the edge, and a back-street agent not
    // hidden behind the board or a prop — nobody could see it wave.
    const agents = agentsOnStage(stageFigures(tick, effects).figures).filter(
      (f) =>
        f.x >= 0 &&
        f.x + FIGURE_W + 1 <= safeCols &&
        (f.depth === "front" ||
          [0, 1, 2, 3].every((dx) => !base.isFront(f.x + dx, f.y))),
    );
    const score = (f: FigureSnapshot) =>
      (f.depth === "front" ? 4 : 0) +
      (hasRoom(f) ? 2 : 0) +
      (f.phase === "gathered" ? 1 : 0);
    return [...agents].sort((a, b) => score(b) - score(a) || b.x - a.x)[0];
  };

  // Passers-by always include an agent, so any square with a street to
  // walk on has an agent to wave to sooner or later.
  const playable = {
    agent: layout.street - FIGURE_H + 1 >= 0,
    lamp: lamps.length > 0,
    fountain: fountains.length > 0,
  };

  const safe = data.safeZone ?? null;
  const skyLeft = safe ? Math.max(0, safe.x + safe.w) : 0;
  const sky =
    skyLeft < safeCols && layout.street > 0
      ? { x: skyLeft, y: 0, w: safeCols - skyLeft, h: layout.street }
      : null;

  const greetingFor = (tick: number, effects: TownSquareEffects) => {
    const greet = effects.greet;
    const stage = greetStage(greet, tick);
    if (!greet || !stage) return null;
    return { greet, stage };
  };

  return {
    cols: safeCols,
    rows: safeRows,
    board,
    boardLines,
    street: layout.street,
    front: layout.front,
    buildings,
    lamps: lamps.map(rect),
    fountains: fountains.map(rect),
    playable,
    sky,

    frame(tick: number, effects = NO_EFFECTS): TownSquareFrame {
      const level = nightLevel(effects.lighting, tick);
      const dark = level >= 1 ? fullNight() : null;
      const source = dark ? dark.grid : base;
      const statics = dark ? dark.layers : staticLayers;
      const redraw = new Set(dynamicRows);
      const dusk = level > 0 && !dark;
      if (dusk) for (const y of nightRows) redraw.add(y);

      const { figures, walking } = stageFigures(tick, effects);

      const greeting = greetingFor(tick, effects);
      const waver = greeting
        ? figures.find(
            (f) => f.id === greeting.greet.figureId && f.kind === "agent",
          )
        : undefined;
      const bubble =
        greeting && waver
          ? placeBubble(
              base,
              waver,
              greetingText(waver.id, greeting.greet.line, greetings),
              layout.board,
            )
          : null;
      if (bubble) for (let r = 0; r < BUBBLE_H; r++) redraw.add(bubble.y + r);

      const splashFountain = effects.splash
        ? fountains[effects.splash.fountain]
        : undefined;
      const burst = splashFountain
        ? splashBurstAge(effects.splash, tick)
        : null;
      if (splashFountain && burst !== null) {
        for (
          let y = splashFountain.y - SPLASH_HEADROOM;
          y <= layout.front + 1;
          y++
        )
          redraw.add(y);
      }

      const rowsToDraw = [...redraw].filter(inGrid);
      work.copyRowsFrom(source, rowsToDraw);
      if (dusk) {
        for (const c of nightCells)
          if (c.order < level) work.put(c.x, c.y, c.ch, c.layer);
      }
      for (const f of fountains) drawFountainWater(work, f, tick);
      if (splashFountain && burst !== null && burst < SPLASH_BURST_TICKS)
        drawDroplets(work, splashFountain, layout.front + 1, burst);

      // The neighbour who waves back: the nearest human in the same group.
      const neighbour =
        waver &&
        greeting &&
        waver.group >= 0 &&
        greetReplying(greeting.greet, tick)
          ? figures
              .filter(
                (f) =>
                  f.kind === "human" &&
                  f.group === waver.group &&
                  f.depth === "front",
              )
              .sort(
                (a, b) => Math.abs(a.x - waver.x) - Math.abs(b.x - waver.x),
              )[0]
          : undefined;

      figures.forEach((f, i) => {
        let wave: Wave | null = null;
        if (greeting && f === waver) {
          wave = { side: "right", armUp: waveArmUp(greeting.greet, tick) };
        } else if (greeting && waver && f === neighbour) {
          wave = {
            side: f.x > waver.x ? "left" : "right",
            armUp: waveArmUp(greeting.greet, tick, GREET_REPLY_DELAY),
          };
        }
        const pose: Pose = {
          walking: f.phase !== "gathered" || walking.has(f.id),
          wave,
        };
        const sprite = figureSprite(f, tick, i, pose);
        if (f.depth === "back") {
          // Fainter, and hidden behind anything standing on the front line.
          work.sprite(f.x, f.y, sprite, "scenery", { behindFront: true });
        } else {
          work.sprite(f.x, f.y, sprite, "people");
        }
      });
      if (bubble && greeting) drawBubble(work, bubble, greeting.stage);

      const layers = emptyLayers();
      for (let y = 0; y < safeRows; y++) {
        for (const layer of LAYER_NAMES) {
          layers[layer].push(
            redraw.has(y) ? work.row(y, layer) : statics[layer][y]!,
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
        night: level,
      };
    },

    targetAt(col, row, tick, effects = NO_EFFECTS) {
      const { figures } = stageFigures(tick, effects);
      const agentAt = (depth: FigureDepth): SquareTarget | null => {
        const hit = figures.find(
          (f) =>
            f.kind === "agent" &&
            f.depth === depth &&
            contains(
              { x: f.x, y: f.y, w: FIGURE_W, h: FIGURE_H },
              col,
              row,
              HIT_PAD,
            ),
        );
        return hit ? { kind: "agent", figureId: hit.id } : null;
      };
      // Front line first; a back-street agent only wins over empty paving,
      // never over a prop standing in front of it.
      const front = agentAt("front");
      if (front) return front;
      const fi = fountainBoxes.findIndex((f) => contains(f, col, row, HIT_PAD));
      if (fi >= 0) return { kind: "fountain", index: fi };
      const li = lamps.findIndex((l) => contains(l, col, row, HIT_PAD));
      if (li >= 0) return { kind: "lamp", index: li };
      return agentAt("back");
    },

    suggestTarget(kind, tick, options = {}) {
      const effects = options.effects ?? NO_EFFECTS;
      switch (kind) {
        case "lamp":
          return lamps.length
            ? { target: { kind, index: lamps.length - 1 }, at: tick }
            : null;
        case "fountain":
          return fountains.length
            ? { target: { kind, index: 0 }, at: tick }
            : null;
        case "agent": {
          const lookahead = Math.max(0, Math.floor(options.lookahead ?? 0));
          for (let at = tick; at <= tick + lookahead; at++) {
            const agent = bestAgent(at, effects);
            if (agent) return { target: { kind, figureId: agent.id }, at };
          }
          return null;
        }
      }
    },
  };
}

/** One-shot convenience: build the square and render a single tick. */
export function renderTownSquare(
  tick: number,
  cols: number,
  rows: number,
  data: TownSquareData,
  effects?: TownSquareEffects,
): TownSquareFrame {
  return createTownSquare(cols, rows, data).frame(tick, effects);
}
