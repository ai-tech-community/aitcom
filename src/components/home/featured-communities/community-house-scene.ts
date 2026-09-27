/**
 * A community's "house on the square": a small ASCII picture for a featured
 * community card, drawn in the town square's language (the shared gabled
 * house, street tree and human `o` / agent `[•]` figures).
 *
 * Pure frame function — no DOM, no clock, no Math.random. The picture is a
 * deterministic function of `(slug, memberCount, cols, rows, tick)`:
 * - the building (gable steps, width, height, a rooftop behind it, a tree
 *   beside it, where it stands) is seeded from the slug, so each community
 *   has its own stable house;
 * - the row of figures in front is scaled from the real member count on a
 *   log curve with a cap, so 3 and 38 members look different and a huge
 *   community never overflows the card. The figures are decoration; the
 *   card states the real count in text.
 *
 * Layers match the town square so the renderer colours them the same way:
 * `far` (rooftops behind), `scenery` (house, tree, paving), `people`.
 */

import {
  FIGURE_H,
  FIGURE_W,
  figure,
  type FigureKind,
  type FigurePose,
} from "@/components/ascii/figures";
import {
  DEPTH_X,
  DEPTH_Y,
  drawHouse,
  minHouseHeight,
  type GableHouse,
} from "@/components/ascii/gabled-house";
import type { CellRect } from "@/components/ascii/measure";
import { LayeredCanvas } from "@/components/ascii/layered-canvas";
import { rand, seedFromString } from "@/components/ascii/seeded";
import { TREE } from "@/components/ascii/street-props";

export type CommunityLayer = "far" | "scenery" | "people";

export const COMMUNITY_LAYERS: readonly CommunityLayer[] = [
  "far",
  "scenery",
  "people",
];

export type CommunityFrame = Record<CommunityLayer, string[]>;

/** Most figures a card ever shows, however large the community. */
export const MAX_FIGURES = 10;

/** Cells per figure in the row: 3 wide plus a 1-cell gap. */
const FIGURE_PITCH = FIGURE_W + 1;

/**
 * Rows between the street line and the figures' feet: one deeper than the
 * hero square, so heads stand clear of the house's cast shadow.
 */
const FLOOR_DEPTH = 4;

/** Empty rows kept above the tallest roof. */
const SKY_ROWS = 1;

// ─── Timeline ────────────────────────────────────────────────────────────────

/** Each figure gets a turn to wave; a turn lasts this many ticks. */
const WAVE_TURN = 24;
/** Ticks of a turn during which the arm flaps (up two, down two). */
const WAVE_TICKS = 8;

/** Reduced-motion frame: the first figure mid-wave, a friendly hello. */
export const COMMUNITY_STILL_TICK = 1;

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

// ─── Layout ──────────────────────────────────────────────────────────────────

interface CommunityLayout {
  street: number;
  front: number;
  house: GableHouse | null;
  tree: { x: number; y: number } | null;
  figures: { kind: FigureKind; x: number }[];
}

/** Gable steps, width and height the slug asks for, before fitting. */
function houseWish(seed: number) {
  const steps = rand(seed, 1) < 0.5 ? 1 : 2;
  const bays = Math.floor(rand(seed, 2) * 3);
  return {
    steps,
    w: 4 * steps + 5 + 4 * bays,
    extraHeight: Math.floor(rand(seed, 3) * 4),
  };
}

function layoutHouse(
  seed: number,
  cols: number,
  street: number,
): GableHouse | null {
  const wish = houseWish(seed);
  // Tallest body that keeps one row of sky above its back outline, so the
  // gable never touches the card's top edge.
  const maxH = street - DEPTH_Y - SKY_ROWS + 1;
  // Prefer the wished gable; fall back to one step when rows are tight.
  const steps = maxH >= minHouseHeight(wish.steps) ? wish.steps : 1;
  if (maxH < minHouseHeight(steps)) return null;
  const h = Math.min(maxH, minHouseHeight(steps) + wish.extraHeight);

  // Footprint: front face + receding side + cast shadow.
  const room = cols - DEPTH_X - 3;
  let w = wish.w;
  while (w > 4 * steps + 5 && w > room) w -= 4;
  if (w > room) return null;

  const slack = room - w;
  const x = 1 + Math.round(slack * (0.2 + 0.6 * rand(seed, 4)));
  const y = street - h + 1;

  let far: CellRect | null = null;
  const rise = 2 + Math.floor(rand(seed, 5) * 3);
  const farY = y - DEPTH_Y - rise;
  if (rand(seed, 6) < 0.6 && farY >= SKY_ROWS) {
    const farW = Math.max(5, w - 2 - Math.floor(rand(seed, 7) * 3));
    const farX = x + 1 + Math.floor(rand(seed, 8) * (w - farW));
    if (farX + farW + DEPTH_X < cols) {
      far = { x: farX, y: farY, w: farW, h: y + 2 - farY };
    }
  }
  return { x, y, w, h, steps, far };
}

/** A tree on the roomier side of the house, when it fits the street. */
function layoutTree(
  seed: number,
  cols: number,
  street: number,
  house: GableHouse | null,
): { x: number; y: number } | null {
  const tw = TREE[0]!.length;
  const y = street - TREE.length + 1;
  if (y < 0 || !house) return null;
  const leftRoom = house.x - 2;
  const rightStart = house.x + house.w + DEPTH_X + 3;
  const rightRoom = cols - 1 - rightStart;
  const preferRight = rightRoom >= leftRoom;
  if (preferRight && rightRoom >= tw) return { x: rightStart, y };
  if (leftRoom >= tw) return { x: house.x - 2 - tw, y };
  return null;
}

function layoutFigures(
  seed: number,
  memberCount: number,
  cols: number,
  house: GableHouse | null,
): { kind: FigureKind; x: number }[] {
  const fitsWidth = Math.floor((cols - 2 + 1) / FIGURE_PITCH);
  const n = Math.max(
    0,
    Math.min(figureCountForMembers(memberCount), fitsWidth),
  );
  if (n === 0) return [];

  const kinds: FigureKind[] = Array.from({ length: n }, (_, i) =>
    rand(seed, 20, i) < 0.4 ? "agent" : "human",
  );
  // Humans and agents build together: any row of two or more has both.
  if (n >= 2 && !kinds.includes("agent")) kinds[1 + (seed % (n - 1))] = "agent";
  if (n >= 2 && !kinds.includes("human")) kinds[seed % n] = "human";

  // Centre the row on the house (or the card), keeping it on the grid.
  const rowW = n * FIGURE_PITCH - 1;
  const centre = house
    ? house.x + Math.floor((house.w + DEPTH_X) / 2)
    : Math.floor(cols / 2);
  const start = Math.max(
    1,
    Math.min(cols - 1 - rowW, centre - Math.floor(rowW / 2)),
  );
  return kinds.map((kind, i) => ({ kind, x: start + i * FIGURE_PITCH }));
}

function layout(
  slug: string,
  memberCount: number,
  cols: number,
  rows: number,
): CommunityLayout {
  const seed = seedFromString(slug);
  const front = rows - 2;
  const street = front - FLOOR_DEPTH;
  const house = street >= 0 ? layoutHouse(seed, cols, street) : null;
  return {
    street,
    front,
    house,
    tree: layoutTree(seed, cols, street, house),
    figures: layoutFigures(seed, memberCount, cols, house),
  };
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

function drawPaving(
  c: LayeredCanvas<CommunityLayer>,
  street: number,
  front: number,
) {
  for (let x = 0; x < c.width; x++) c.put(x, street, "_", "scenery");
  // One tile row in front of the figures' feet; none among them, so the
  // figures read as standing on the square rather than in the pattern.
  for (let x = 2; x < c.width; x += 6) c.put(x, front + 1, ".", "scenery");
}

function figurePose(
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

/**
 * The community's house for a `cols` × `rows` grid at `tick`. Every row of
 * every layer is exactly `cols` wide; each cell belongs to one layer.
 */
export function communityHouseFrame(
  slug: string,
  memberCount: number,
  cols: number,
  rows: number,
  tick: number = COMMUNITY_STILL_TICK,
): CommunityFrame {
  const w = Math.max(0, Math.floor(cols));
  const h = Math.max(0, Math.floor(rows));
  const c = new LayeredCanvas<CommunityLayer>(w, h, COMMUNITY_LAYERS);
  const t = Math.max(0, Math.floor(tick));
  const plan = layout(slug, memberCount, w, h);

  if (plan.street >= 0) drawPaving(c, plan.street, plan.front);
  if (plan.tree) c.sprite(plan.tree.x, plan.tree.y, TREE, "scenery");
  if (plan.house) drawHouse(c, plan.house, plan.street);

  const feetTop = plan.front - FIGURE_H + 1;
  plan.figures.forEach((f, i) => {
    const pose = figurePose(i, plan.figures.length, f.kind, t);
    c.sprite(f.x, feetTop, figure(f.kind, t, pose), "people");
  });
  return c.frame();
}
