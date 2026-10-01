/**
 * Stars for an ASCII scene at night, shared by the homepage square and
 * the Explore street: a few seeded stars in the open sky, spaced apart and
 * kept well above the rooftops. Pure — the caller says which cells are
 * free and draws the result.
 */

import { rand } from "./seeded";

export const STAR_GLYPHS = ["+", ".", "+", "'"] as const;
const STAR_SPACING = 7;
const MAX_STARS = 10;

export type Star = {
  x: number;
  y: number;
  ch: string;
  /** The attempt that placed it, for callers that seed more per star. */
  index: number;
};

/**
 * Stars for a `cols` × `rows` grid, above `skyTop`. `skyline[x]` is the
 * first drawn row of column `x` (rows when the column is empty); a star
 * keeps two rows clear of the roofs around it. `isFree` rejects cells the
 * caller needs (drawn art, text zones).
 */
export function placeStars({
  cols,
  rows,
  skyTop,
  seed,
  skyline,
  isFree,
}: {
  cols: number;
  rows: number;
  skyTop: number;
  seed: number;
  skyline: readonly number[];
  isFree: (x: number, y: number) => boolean;
}): Star[] {
  const stars: Star[] = [];
  const want = Math.min(MAX_STARS, Math.max(3, Math.floor(cols / 18)));
  for (let i = 0; i < want * 12 && stars.length < want; i++) {
    const x = 1 + Math.floor(rand(seed, 67, i) * Math.max(1, cols - 2));
    const y = Math.floor(rand(seed, 71, i) * Math.max(1, skyTop));
    const roof = Math.min(
      skyline[x - 1] ?? rows,
      skyline[x] ?? rows,
      skyline[x + 1] ?? rows,
    );
    if (y >= roof - 2 || !isFree(x, y)) continue;
    if (
      stars.some(
        (s) => Math.abs(s.x - x) < STAR_SPACING && Math.abs(s.y - y) < 2,
      )
    )
      continue;
    stars.push({ x, y, ch: STAR_GLYPHS[i % STAR_GLYPHS.length]!, index: i });
  }
  return stars;
}
