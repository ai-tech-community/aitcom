/**
 * A community's "house on the square": a small ASCII picture of one
 * community (homepage featured cards, the Explore page's organizer
 * invite), drawn in the town square's language (the shared gabled
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

import { FIGURE_H, figure, type FigureKind } from "@/components/ascii/figures";
import {
  communityFigurePose,
  layoutCommunityFigures,
  layoutCommunityHouse,
} from "@/components/ascii/community-house";
import {
  DEPTH_X,
  drawHouse,
  type GableHouse,
} from "@/components/ascii/gabled-house";
import { LayeredCanvas } from "@/components/ascii/layered-canvas";
import { seedFromString } from "@/components/ascii/seeded";
import { TREE } from "@/components/ascii/street-props";

export type CommunityLayer = "far" | "scenery" | "people";

export const COMMUNITY_LAYERS: readonly CommunityLayer[] = [
  "far",
  "scenery",
  "people",
];

export type CommunityFrame = Record<CommunityLayer, string[]>;

/**
 * Rows between the street line and the figures' feet: one deeper than the
 * hero square, so heads stand clear of the house's cast shadow.
 */
const FLOOR_DEPTH = 4;

/** Reduced-motion frame: the first figure mid-wave, a friendly hello. */
export const COMMUNITY_STILL_TICK = 1;

// ─── Layout ──────────────────────────────────────────────────────────────────

interface CommunityLayout {
  street: number;
  front: number;
  house: GableHouse | null;
  tree: { x: number; y: number } | null;
  figures: { kind: FigureKind; x: number }[];
}

/** A tree on the roomier side of the house, when it fits the street. */
function layoutTree(
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

function layout(
  slug: string,
  memberCount: number,
  cols: number,
  rows: number,
): CommunityLayout {
  const seed = seedFromString(slug);
  const front = rows - 2;
  const street = front - FLOOR_DEPTH;
  const lane = { x: 0, width: cols };
  const house = street >= 0 ? layoutCommunityHouse(seed, lane, street) : null;
  return {
    street,
    front,
    house,
    tree: layoutTree(cols, street, house),
    figures: layoutCommunityFigures(seed, memberCount, lane, house),
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
    const pose = communityFigurePose(i, plan.figures.length, f.kind, t);
    c.sprite(f.x, feetTop, figure(f.kind, t, pose), "people");
  });
  return c.frame();
}
