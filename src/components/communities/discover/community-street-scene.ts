/**
 * The Explore page's square: a street where every community is a house,
 * drawn in the town square's language (shared gabled house, human `o` and
 * agent `[•]` figures).
 *
 * Pure frame function — no DOM, no clock, no Math.random. Each house is
 * seeded from its slug (same building as on the homepage card) and reads
 * its community's real signals:
 * - lit windows: people active recently (none lit when nobody was);
 * - a flag on the roof: an event is coming up;
 * - the row of figures in front: the member count, on the shared log curve;
 * - the name under the house, so the street can be read without the list.
 * The picture is decoration (aria-hidden); the list beside it carries the
 * same facts as text.
 *
 * `activeSlug` inks one house at full strength and brackets its name — the
 * one the visitor is pointing at.
 */

import {
  MIN_LANE_WIDTH,
  communityFigurePose,
  layoutCommunityFigures,
  layoutCommunityHouse,
  type Lane,
} from "@/components/ascii/community-house";
import { FIGURE_H, figure } from "@/components/ascii/figures";
import {
  drawHouse,
  type GableHouse,
  type HouseLayer,
  type HouseSurface,
} from "@/components/ascii/gabled-house";
import { LayeredCanvas } from "@/components/ascii/layered-canvas";
import { textWidth } from "@/components/ascii/cells";
import { hash, seedFromString } from "@/components/ascii/seeded";

export type StreetLayer = "far" | "scenery" | "people" | "glow";

export const STREET_LAYERS: readonly StreetLayer[] = [
  "far",
  "scenery",
  "people",
  "glow",
];

export type StreetFrame = Record<StreetLayer, string[]>;

export interface StreetHouse {
  slug: string;
  name: string;
  memberCount: number;
  /** Distinct people active in the discovery window. */
  activeRecently: number;
  hasUpcomingEvent: boolean;
}

/**
 * Lane width on a wide street: more than a house needs, so the name under
 * it is readable (about 18 characters). A narrow street (phones) packs
 * houses at the smallest lane instead, so it still shows a few.
 */
export const STREET_LANE_WIDTH = 20;

/** Below this many lanes' worth of width, the street packs lanes tight. */
const ROOMY_LANES = 4;

function laneWidthFor(width: number): number {
  return width >= ROOMY_LANES * STREET_LANE_WIDTH
    ? STREET_LANE_WIDTH
    : MIN_LANE_WIDTH;
}

/** Most houses the street ever shows; the grid holds the rest. */
export const MAX_STREET_HOUSES = 10;

/** Reduced-motion frame: the first figure of each house mid-wave. */
export const STREET_STILL_TICK = 1;

/** Active people at which every window of a house is lit. */
export const FULLY_LIT_AT = 6;

/** Rows from the street line down to the figures' feet. */
const FLOOR_DEPTH = 4;

const LIT_WINDOW = "##";

/** Spread of per-house tick offsets. */
const HOUSE_RHYTHM = 37;

/** How far houses rise into spare sky: a skyline, with room left above. */
const SKYLINE_GROW = 0.5;

/** Fewest rows that fit the smallest house above the figures and name. */
export const MIN_STREET_ROWS = 15;

export type StreetOptions = {
  tick?: number;
  /** The house the visitor is pointing at, inked and bracketed. */
  activeSlug?: string | null;
  /**
   * Share (0–0.9) of the width kept free of houses on the left, e.g. for a
   * headline standing on the street. The paving still runs under it.
   */
  reserve?: number;
  /** Sign text for the empty lot at the end of the street; none if absent. */
  lotLabel?: string | null;
};

/** Where things stand: lanes from `start`, houses first, then the lot. */
export type StreetPlan = {
  start: number;
  lanes: Lane[];
  houses: number;
  lot: boolean;
};

/**
 * Lays the street out for `cols`: the reserved strip on the left, then as
 * many equal lanes as fit. Houses take the lanes in order; with a lot, it
 * takes the lane after the last house — or the last lane when the street
 * is full, so the invitation is always on it.
 */
export function planStreet(
  cols: number,
  houseCount: number,
  { reserve = 0, lot = false }: { reserve?: number; lot?: boolean } = {},
): StreetPlan {
  const w = Math.max(0, Math.floor(cols));
  const start = Math.round(Math.min(0.9, Math.max(0, reserve)) * w);
  const fit = Math.floor((w - start) / laneWidthFor(w - start));
  let houses = Math.max(0, Math.min(MAX_STREET_HOUSES, houseCount, fit));
  const withLot = lot && fit >= 1 && (houses < fit || fit >= 2);
  if (withLot && houses >= fit) houses = fit - 1;
  const lanes = streetLanes(houses + (withLot ? 1 : 0), w - start).map(
    (lane) => ({ x: lane.x + start, width: lane.width }),
  );
  return { start, lanes, houses, lot: withLot };
}

/**
 * `count` equal lanes across `cols`. Lane `i` starts at `i / count` of the
 * width, so an overlay split into equal fractions lines up with the houses.
 */
export function streetLanes(count: number, cols: number): Lane[] {
  return Array.from({ length: count }, (_, i) => {
    const x = Math.round((i * cols) / count);
    const next = Math.round(((i + 1) * cols) / count);
    return { x, width: next - x };
  });
}

/** How many of `windows` windows are lit for `active` recent people. */
export function litWindowCount(active: number, windows: number): number {
  if (!(active > 0) || windows <= 0) return 0;
  const share = Math.min(1, active / FULLY_LIT_AT);
  return Math.max(1, Math.round(share * windows));
}

/** Draws a house onto the canvas, optionally inked as the active one. */
function houseSurface(
  c: LayeredCanvas<StreetLayer>,
  active: boolean,
): HouseSurface {
  const layerFor = (layer: HouseLayer): StreetLayer =>
    active && layer === "scenery" ? "people" : layer;
  return {
    put: (x, y, ch, layer) => c.put(x, y, ch, layerFor(layer)),
    text: (x, y, s, layer) => c.text(x, y, s, layerFor(layer)),
  };
}

/** Pennant on a pole just above the gable's ridge. */
function drawFlag(c: LayeredCanvas<StreetLayer>, house: GableHouse) {
  const cx = house.x + Math.floor(house.w / 2);
  c.text(cx, house.y - 2, "|>", "glow");
  c.put(cx, house.y - 1, "|", "glow");
}

/** The name under the lane, shortened with an ellipsis when it must be. */
function laneLabel(name: string, width: number): string {
  const room = Math.max(0, width - 2);
  if (textWidth(name) <= room) return name;
  let out = "";
  for (const ch of name) {
    if (textWidth(out + ch) > room - 1) break;
    out += ch;
  }
  return `${out.trimEnd()}…`;
}

/** The empty lot: a signpost inviting the next community. */
function drawLot(
  c: LayeredCanvas<StreetLayer>,
  lane: Lane,
  street: number,
  label: string,
) {
  const text = laneLabel(label, lane.width - 3);
  const boxW = textWidth(text) + 4;
  const x = lane.x + Math.floor((lane.width - boxW) / 2);
  const top = street - 6;
  if (top < 0) return;
  c.text(x, top, `.${"-".repeat(boxW - 2)}.`, "people");
  c.text(x, top + 1, `| ${text} |`, "people");
  c.text(x, top + 2, `'${"-".repeat(boxW - 2)}'`, "people");
  const post = x + Math.floor(boxW / 2) - 1;
  for (let y = top + 3; y < street; y++) c.text(post, y, "||", "scenery");
  // Pegs marking out the plot on the paving.
  c.put(lane.x + 1, street, "+", "scenery");
  c.put(lane.x + lane.width - 2, street, "+", "scenery");
}

/**
 * The street for a `cols` × `rows` grid. Every row of every layer is
 * exactly `cols` wide; each cell belongs to one layer.
 */
export function communityStreetFrame(
  houses: readonly StreetHouse[],
  cols: number,
  rows: number,
  {
    tick = STREET_STILL_TICK,
    activeSlug = null,
    reserve = 0,
    lotLabel = null,
  }: StreetOptions = {},
): StreetFrame {
  const w = Math.max(0, Math.floor(cols));
  const h = Math.max(0, Math.floor(rows));
  const c = new LayeredCanvas<StreetLayer>(w, h, STREET_LAYERS);
  const t = Math.max(0, Math.floor(tick));

  const label = h - 1;
  const front = h - 3;
  const street = front - FLOOR_DEPTH;
  if (street < 0) return c.frame();

  for (let x = 0; x < w; x++) c.put(x, street, "_", "scenery");
  for (let x = 2; x < w; x += 6) c.put(x, front + 1, ".", "scenery");

  const plan = planStreet(w, houses.length, { reserve, lot: !!lotLabel });
  const shown = houses.slice(0, plan.houses);
  const feetTop = front - FIGURE_H + 1;
  if (plan.lot && lotLabel) {
    drawLot(c, plan.lanes[plan.houses]!, street, lotLabel);
  }

  shown.forEach((community, i) => {
    const lane = plan.lanes[i]!;
    const seed = seedFromString(community.slug);
    const active = community.slug === activeSlug;
    const house = layoutCommunityHouse(seed, lane, street, {
      grow: SKYLINE_GROW,
    });

    if (house) {
      const windows: { x: number; y: number }[] = [];
      drawHouse(houseSurface(c, active), house, street, windows);
      // A stable, seeded order, so the same windows stay lit between frames.
      const lit = [...windows]
        .sort((a, b) => hash(seed, a.x, a.y) - hash(seed, b.x, b.y))
        .slice(0, litWindowCount(community.activeRecently, windows.length));
      for (const win of lit) c.text(win.x, win.y, LIT_WINDOW, "glow");
      if (community.hasUpcomingEvent) drawFlag(c, house);
    }

    const figures = layoutCommunityFigures(
      seed,
      community.memberCount,
      lane,
      house,
    );
    // Each house keeps its own rhythm, so the street never waves in unison.
    const own = t + (seed % HOUSE_RHYTHM);
    figures.forEach((f, j) => {
      const pose = communityFigurePose(j, figures.length, f.kind, own);
      c.sprite(f.x, feetTop, figure(f.kind, own, pose), "people");
    });

    // The active house's name is bracketed, like the house tabs' active
    // state, so the mark does not rest on ink weight alone.
    const name = active
      ? `[ ${laneLabel(community.name, lane.width - 4)} ]`
      : laneLabel(community.name, lane.width);
    const nameX = lane.x + Math.floor((lane.width - textWidth(name)) / 2);
    c.text(nameX, label, name, active ? "glow" : "people");
  });

  return c.frame();
}
