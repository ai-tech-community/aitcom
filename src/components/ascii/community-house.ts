/**
 * A community's house on the square, as layout rules shared by every scene
 * that draws one (the homepage featured cards and the Explore street): the
 * seeded building, the row of people and agents in front of it, and how
 * that row waves. Pure layout — no drawing, no DOM, no clock.
 *
 * Everything is laid out inside a horizontal `lane` (a start column and a
 * width), so a scene can hold one house or a street of them.
 */

import { FIGURE_W, type FigureKind, type FigurePose } from "./figures";
import {
  DEPTH_X,
  DEPTH_Y,
  minHouseHeight,
  type GableHouse,
} from "./gabled-house";
import type { CellRect } from "./measure";
import { rand } from "./seeded";

/** The columns a house and its people may use: `[x, x + width)`. */
export interface Lane {
  x: number;
  width: number;
}

/** Most figures a house ever shows, however large the community. */
export const MAX_FIGURES = 10;

/** Cells per figure in the row: 3 wide plus a 1-cell gap. */
export const FIGURE_PITCH = FIGURE_W + 1;

/** Empty rows kept above the tallest roof. */
const SKY_ROWS = 1;

/** Each figure gets a turn to wave; a turn lasts this many ticks. */
const WAVE_TURN = 24;
/** Ticks of a turn during which the arm flaps (up two, down two). */
const WAVE_TICKS = 8;

/** Narrowest front face a house is ever drawn with (one gable step). */
export const MIN_HOUSE_WIDTH = 9;

/**
 * Columns one house needs: its narrowest face, the receding side and the
 * cast shadow, plus a cell of air on each side.
 */
export const MIN_LANE_WIDTH = MIN_HOUSE_WIDTH + DEPTH_X + 3 + 1;

/**
 * How many figures stand for `members` people: one per doubling (roughly),
 * starting from a single figure, capped at `MAX_FIGURES`. Monotone.
 * 1→1, 3→3, 4→3, 10→5, 38→8, 100→10.
 */
export function figureCountForMembers(members: number): number {
  const m = Number.isFinite(members) ? Math.floor(members) : 0;
  if (m <= 0) return 0;
  return Math.min(MAX_FIGURES, 1 + Math.floor(1.4 * Math.log2(m)));
}

/** Gable steps, width and height the seed asks for, before fitting. */
function houseWish(seed: number) {
  const steps = rand(seed, 1) < 0.5 ? 1 : 2;
  const bays = Math.floor(rand(seed, 2) * 3);
  return {
    steps,
    w: 4 * steps + 5 + 4 * bays,
    extraHeight: Math.floor(rand(seed, 3) * 4),
  };
}

/**
 * The seeded house standing on `street`, fitted into `lane`. Null when the
 * lane is too narrow or the sky too low for even the smallest house.
 */
export function layoutCommunityHouse(
  seed: number,
  lane: Lane,
  street: number,
  {
    grow = 0,
  }: {
    /**
     * Share (0–1) of the spare sky the house may rise into, so a tall scene
     * becomes a skyline of canal houses instead of small houses under empty
     * sky. Each house takes a seeded part of it, so heights vary.
     */
    grow?: number;
  } = {},
): GableHouse | null {
  const wish = houseWish(seed);
  // Tallest body that keeps one row of sky above its back outline, so the
  // gable never touches the top edge.
  const maxH = street - DEPTH_Y - SKY_ROWS + 1;
  // Footprint: front face + receding side + cast shadow.
  const room = lane.width - DEPTH_X - 3;
  // Prefer the wished gable; fall back to one step when rows or columns
  // are too tight for two.
  const steps =
    maxH >= minHouseHeight(wish.steps) && room >= 4 * wish.steps + 5
      ? wish.steps
      : 1;
  if (maxH < minHouseHeight(steps)) return null;
  const base = minHouseHeight(steps) + wish.extraHeight;
  const spare = Math.max(0, maxH - base);
  const growth = Math.round(
    Math.min(1, Math.max(0, grow)) * spare * (0.55 + 0.45 * rand(seed, 9)),
  );
  const h = Math.min(maxH, base + growth);

  let w = steps === wish.steps ? wish.w : 4 * steps + 5;
  while (w > 4 * steps + 5 && w > room) w -= 4;
  if (w > room) return null;

  const slack = room - w;
  const x = lane.x + 1 + Math.round(slack * (0.2 + 0.6 * rand(seed, 4)));
  const y = street - h + 1;

  let far: CellRect | null = null;
  const rise = 2 + Math.floor(rand(seed, 5) * 3);
  const farY = y - DEPTH_Y - rise;
  if (rand(seed, 6) < 0.6 && farY >= SKY_ROWS) {
    const farW = Math.max(5, w - 2 - Math.floor(rand(seed, 7) * 3));
    const farX = x + 1 + Math.floor(rand(seed, 8) * (w - farW));
    if (farX + farW + DEPTH_X < lane.x + lane.width) {
      far = { x: farX, y: farY, w: farW, h: y + 2 - farY };
    }
  }
  return { x, y, w, h, steps, far };
}

/**
 * The row of figures in front of the house: one per `figureCountForMembers`,
 * as many as fit the lane, humans and agents mixed (any row of two or more
 * has both), centred on the house.
 */
export function layoutCommunityFigures(
  seed: number,
  memberCount: number,
  lane: Lane,
  house: GableHouse | null,
): { kind: FigureKind; x: number }[] {
  const fitsWidth = Math.floor((lane.width - 2 + 1) / FIGURE_PITCH);
  const n = Math.max(
    0,
    Math.min(figureCountForMembers(memberCount), fitsWidth),
  );
  if (n === 0) return [];

  const kinds: FigureKind[] = Array.from({ length: n }, (_, i) =>
    rand(seed, 20, i) < 0.4 ? "agent" : "human",
  );
  if (n >= 2 && !kinds.includes("agent")) kinds[1 + (seed % (n - 1))] = "agent";
  if (n >= 2 && !kinds.includes("human")) kinds[seed % n] = "human";

  const rowW = n * FIGURE_PITCH - 1;
  const centre = house
    ? house.x + Math.floor((house.w + DEPTH_X) / 2)
    : lane.x + Math.floor(lane.width / 2);
  const start = Math.max(
    lane.x + 1,
    Math.min(lane.x + lane.width - 1 - rowW, centre - Math.floor(rowW / 2)),
  );
  return kinds.map((kind, i) => ({ kind, x: start + i * FIGURE_PITCH }));
}

/** The pose of figure `index` of `count` at tick `t`: each waves in turn. */
export function communityFigurePose(
  index: number,
  count: number,
  kind: FigureKind,
  t: number,
): FigurePose {
  const turn = Math.floor(t / WAVE_TURN) % count;
  const inTurn = t % WAVE_TURN;
  const armUp = turn === index && inTurn < WAVE_TICKS && inTurn % 4 < 2;
  const blink = kind === "agent" && !armUp && (t + index * 11) % 43 === 0;
  return { arm: armUp ? "up" : undefined, blink };
}
