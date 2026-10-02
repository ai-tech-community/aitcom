/**
 * Emblem geometry (ADR-0039): the silhouette, glyph placement and hue of
 * every kind of badge, as data the `BadgeEmblem` component draws.
 *
 * Every track has its own silhouette, so a member recognises the track at
 * a glance at any tier; the tier only changes the ring. Milestones share
 * one simpler silhouette, the limited edition and awards have their own.
 *
 * Paths live in a 100 × 100 box. Each starts at (or next to) the top and
 * runs clockwise, so a stroke dashed with `pathLength` (the locked
 * progress arc) grows from the top like a clock hand.
 *
 * Hues are CSS custom properties (`--emblem-hue-*` in globals.css), never
 * Signal Orange (One Voice Rule).
 */
import type { BadgeTrackId } from "./catalog";

export type EmblemShapeId =
  | "ticket"
  | "arch"
  | "shield"
  | "page"
  | "hexagon"
  | "pentagon"
  | "octagon"
  | "quatrefoil"
  | "squircle"
  | "diamond"
  | "drop"
  | "circle"
  | "rosette"
  | "medal";

export interface EmblemShape {
  id: EmblemShapeId;
  /** The silhouette, starting at the top and running clockwise. */
  d: string;
  /** The point the tier rings scale about. */
  cx: number;
  cy: number;
  /** Distance from that point to the nearest edge; sizes the ring insets. */
  r: number;
  /** Where the glyph sits: its centre and the side of its square box. */
  glyph: { cx: number; cy: number; size: number };
}

type Point = readonly [number, number];

const round = (n: number) => Math.round(n * 100) / 100;
const pt = ([x, y]: Point) => `${round(x)} ${round(y)}`;

/** Vertices of a regular polygon, the first at the top, clockwise. */
function regularPolygon(
  sides: number,
  radius: number,
  [cx, cy]: Point,
  rotationDeg = 0,
): Point[] {
  return Array.from({ length: sides }, (_, k) => {
    const a = ((-90 + rotationDeg + (k * 360) / sides) * Math.PI) / 180;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)] as const;
  });
}

/**
 * A closed polygon whose corners are rounded with radius `r`, clockwise.
 * It starts at the first corner, or with `fromEdge` at the middle of the
 * edge into the first corner (for a polygon whose top is a flat edge).
 */
function roundedPolygon(
  points: readonly Point[],
  r: number,
  { fromEdge = false } = {},
): string {
  const n = points.length;
  const toward = (from: Point, to: Point): Point => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy);
    return [from[0] + (dx * r) / len, from[1] + (dy * r) / len];
  };
  const parts = points.map((p, i) => {
    const before = toward(p, points[(i - 1 + n) % n]!);
    const after = toward(p, points[(i + 1) % n]!);
    const lead = i === 0 && !fromEdge ? "M" : "L";
    return `${lead}${pt(before)} Q${pt(p)} ${pt(after)}`;
  });
  if (!fromEdge) return `${parts.join(" ")} Z`;
  const last = points[n - 1]!;
  const first = points[0]!;
  const mid: Point = [(last[0] + first[0]) / 2, (last[1] + first[1]) / 2];
  return `M${pt(mid)} ${parts.join(" ")} Z`;
}

/** A circle drawn from the top, clockwise. */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx} ${cy + r} A${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
}

/** A scalloped circle: `lobes` semicircular bumps around radius `r`. */
function rosette(lobes: number, r: number, [cx, cy]: Point): string {
  const step = 360 / lobes;
  const vertices = Array.from({ length: lobes }, (_, k) => {
    const a = ((-90 - step / 2 + k * step) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });
  const bump = round(r * Math.sin(((step / 2) * Math.PI) / 180));
  const arcs = vertices.map(
    (_, k) => `A${bump} ${bump} 0 0 1 ${pt(vertices[(k + 1) % lobes]!)}`,
  );
  return `M${pt(vertices[0]!)} ${arcs.join(" ")} Z`;
}

const CENTRE: Point = [50, 50];

export const EMBLEM_SHAPES: Record<EmblemShapeId, EmblemShape> = {
  ticket: {
    id: "ticket",
    d: "M50 14 H86 A6 6 0 0 1 92 20 V40 A10 10 0 0 0 92 60 V80 A6 6 0 0 1 86 86 H14 A6 6 0 0 1 8 80 V60 A10 10 0 0 0 8 40 V20 A6 6 0 0 1 14 14 Z",
    cx: 50,
    cy: 50,
    r: 36,
    glyph: { cx: 50, cy: 50, size: 40 },
  },
  arch: {
    id: "arch",
    d: "M50 8 A38 38 0 0 1 88 46 V88 A5 5 0 0 1 83 93 H17 A5 5 0 0 1 12 88 V46 A38 38 0 0 1 50 8 Z",
    cx: 50,
    cy: 52,
    r: 40,
    glyph: { cx: 50, cy: 54, size: 42 },
  },
  shield: {
    id: "shield",
    d: "M50 4 L86 15 Q90 16.2 90 20.4 V46 C90 70 74 86 50 96 C26 86 10 70 10 46 V20.4 Q10 16.2 14 15 Z",
    cx: 50,
    cy: 48,
    r: 42,
    glyph: { cx: 50, cy: 46, size: 42 },
  },
  page: {
    id: "page",
    d: "M50 6 H66 L90 30 V88 A6 6 0 0 1 84 94 H16 A6 6 0 0 1 10 88 V12 A6 6 0 0 1 16 6 Z",
    cx: 50,
    cy: 50,
    r: 40,
    glyph: { cx: 49, cy: 52, size: 42 },
  },
  hexagon: {
    id: "hexagon",
    d: roundedPolygon(regularPolygon(6, 49, CENTRE), 7),
    cx: 50,
    cy: 50,
    r: 42,
    glyph: { cx: 50, cy: 50, size: 44 },
  },
  pentagon: {
    id: "pentagon",
    d: roundedPolygon(regularPolygon(5, 50, [50, 54]), 7),
    cx: 50,
    cy: 54,
    r: 40,
    glyph: { cx: 50, cy: 56, size: 40 },
  },
  octagon: {
    id: "octagon",
    d: roundedPolygon(regularPolygon(8, 50, CENTRE, 22.5), 5, {
      fromEdge: true,
    }),
    cx: 50,
    cy: 50,
    r: 46,
    glyph: { cx: 50, cy: 50, size: 46 },
  },
  quatrefoil: {
    id: "quatrefoil",
    d: "M50 4 A24 24 0 0 1 73.9 26.1 A24 24 0 1 1 73.9 73.9 A24 24 0 1 1 26.1 73.9 A24 24 0 1 1 26.1 26.1 A24 24 0 0 1 50 4 Z",
    cx: 50,
    cy: 50,
    r: 40,
    glyph: { cx: 50, cy: 50, size: 42 },
  },
  squircle: {
    id: "squircle",
    d: "M50 8 H72 A20 20 0 0 1 92 28 V72 A20 20 0 0 1 72 92 H28 A20 20 0 0 1 8 72 V28 A20 20 0 0 1 28 8 Z",
    cx: 50,
    cy: 50,
    r: 42,
    glyph: { cx: 50, cy: 50, size: 46 },
  },
  diamond: {
    id: "diamond",
    d: roundedPolygon(regularPolygon(4, 49, CENTRE), 9),
    cx: 50,
    cy: 50,
    r: 35,
    glyph: { cx: 50, cy: 50, size: 38 },
  },
  drop: {
    id: "drop",
    d: "M50 3 C62 18 86 40 86 60 A36 36 0 0 1 14 60 C14 40 38 18 50 3 Z",
    cx: 50,
    cy: 60,
    r: 36,
    glyph: { cx: 50, cy: 61, size: 38 },
  },
  circle: {
    id: "circle",
    d: circle(50, 50, 46),
    cx: 50,
    cy: 50,
    r: 46,
    glyph: { cx: 50, cy: 50, size: 46 },
  },
  rosette: {
    id: "rosette",
    d: rosette(12, 38, CENTRE),
    cx: 50,
    cy: 50,
    r: 42,
    glyph: { cx: 50, cy: 50, size: 40 },
  },
  medal: {
    id: "medal",
    d: circle(50, 62, 32),
    cx: 50,
    cy: 62,
    r: 32,
    glyph: { cx: 50, cy: 62, size: 34 },
  },
};

/** How a kind of badge is drawn: its silhouette and its hue token. */
export interface EmblemStyle {
  shape: EmblemShapeId;
  /**
   * A `--emblem-hue-*` custom property (a bare OKLCH hue angle), or null
   * for a neutral emblem (no chroma).
   */
  hue: `--emblem-hue-${string}` | null;
}

export const TRACK_EMBLEMS: Record<BadgeTrackId, EmblemStyle> = {
  regular: { shape: "ticket", hue: "--emblem-hue-regular" },
  host: { shape: "arch", hue: "--emblem-hue-host" },
  challenger: { shape: "shield", hue: "--emblem-hue-challenger" },
  writer: { shape: "page", hue: "--emblem-hue-writer" },
  builder: { shape: "hexagon", hue: "--emblem-hue-builder" },
  learner: { shape: "pentagon", hue: "--emblem-hue-learner" },
  teacher: { shape: "octagon", hue: "--emblem-hue-teacher" },
  connector: { shape: "quatrefoil", hue: "--emblem-hue-connector" },
  agent_wrangler: { shape: "squircle", hue: "--emblem-hue-agent-wrangler" },
  benchmarker: { shape: "diamond", hue: "--emblem-hue-benchmarker" },
  streak: { shape: "drop", hue: "--emblem-hue-streak" },
};

/** Milestones share one plain silhouette, neutral (no hue). */
export const MILESTONE_EMBLEM: EmblemStyle = {
  shape: "circle",
  hue: null,
};

export const LIMITED_EDITION_EMBLEM: EmblemStyle = {
  shape: "rosette",
  hue: "--emblem-hue-limited",
};

export const AWARD_EMBLEM: EmblemStyle = {
  shape: "medal",
  hue: "--emblem-hue-award",
};
