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
 * `activeSlug` inks one house at full strength — the one the visitor is
 * pointing at in the list or on the street.
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

/** Most houses the street ever shows; the list and grid hold the rest. */
export const MAX_STREET_HOUSES = 6;

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
const SKYLINE_GROW = 0.8;

/** Fewest rows that fit the smallest house above the figures and name. */
export const MIN_STREET_ROWS = 15;

/** How many houses fit a street `cols` wide (never more than there are). */
export function streetCapacity(cols: number, houses: number): number {
  const fit = Math.floor(Math.max(0, cols) / MIN_LANE_WIDTH);
  return Math.max(0, Math.min(MAX_STREET_HOUSES, houses, fit));
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

/**
 * The street for a `cols` × `rows` grid at `tick`. Every row of every layer
 * is exactly `cols` wide; each cell belongs to one layer.
 */
export function communityStreetFrame(
  houses: readonly StreetHouse[],
  cols: number,
  rows: number,
  tick: number = STREET_STILL_TICK,
  activeSlug: string | null = null,
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

  const shown = houses.slice(0, streetCapacity(w, houses.length));
  const lanes = streetLanes(shown.length, w);
  const feetTop = front - FIGURE_H + 1;

  shown.forEach((community, i) => {
    const lane = lanes[i]!;
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

    const name = laneLabel(community.name, lane.width);
    const nameX = lane.x + Math.floor((lane.width - textWidth(name)) / 2);
    c.text(nameX, label, name, active ? "glow" : "people");
  });

  return c.frame();
}
