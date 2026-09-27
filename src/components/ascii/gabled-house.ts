/**
 * The town square's building: a Dutch stepped-gable house with 2.5D volume
 * (back outline shifted by the depth vector, receding corner edges, a shaded
 * side face and a cast shadow), plus an optional taller building one block
 * back. Drawn onto any surface that can `put` and `text` into a `far` and a
 * `scenery` layer, so the hero plaza and smaller scenes share one drawing.
 */

/** Depth vector: the back outline sits this far right / up of the front. */
export const DEPTH_X = 2;
export const DEPTH_Y = 1;

export type HouseLayer = "far" | "scenery";

/** Where a house draws. Out-of-bounds writes must be ignored. */
export interface HouseSurface {
  put(x: number, y: number, ch: string, layer: HouseLayer): void;
  text(x: number, y: number, s: string, layer: HouseLayer): void;
}

export interface HouseRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GableHouse extends HouseRect {
  /** Gable steps (1 or 2); the body starts `2 * steps + 1` rows down. */
  steps: number;
  /** Optional distant rooftop peeking out behind this house. */
  far: HouseRect | null;
}

/** Smallest height that fits the gable, one window row and the door. */
export function minHouseHeight(steps: number): number {
  return 2 * steps + 5;
}

/** Stepped-gable outline (optionally with windows and a door). */
export function drawGableFace(
  grid: HouseSurface,
  house: Pick<GableHouse, "x" | "y" | "w" | "h" | "steps">,
  layer: HouseLayer,
  detailed: boolean,
  windows?: { x: number; y: number }[],
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
      windows?.push({ x: col, y: row });
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
 * `street` is the row the house stands on; the cast shadow falls one below.
 */
export function drawHouse(
  grid: HouseSurface,
  house: GableHouse,
  street: number,
  windows: { x: number; y: number }[] = [],
) {
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

  drawGableFace(grid, house, "scenery", true, windows);

  // Cast shadow on the paving (light from the upper left): light dots
  // under the facade, denser just past the receding side.
  for (let c = x + 2; c <= right + DEPTH_X + 2; c++) {
    const near = c > right && c <= right + DEPTH_X + 1;
    if (near) grid.put(c, street + 1, ":", "scenery");
    else if ((c - x) % 2 === 0) grid.put(c, street + 1, ".", "scenery");
  }
}
