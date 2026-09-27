/**
 * Monospace cell maths for ASCII scenes: text is laid out by grapheme (so
 * "é" or a flag is one unit), and East Asian wide glyphs take two cells.
 */

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
 * The cells `text` fills when written from column `x`: one entry per cell.
 * A wide glyph owns its cell and the next one gets "" (owned, prints
 * nothing), so a row keeps its visual width. With `endCol` (exclusive), a
 * wide glyph that would straddle it is left out rather than spill past it.
 */
export function textCells(
  x: number,
  text: string,
  endCol = Infinity,
): [number, string][] {
  const out: [number, string][] = [];
  let col = x;
  for (const g of graphemes(text)) {
    const w = cellWidth(g);
    if (w === 2 && col + 1 === endCol) break;
    out.push([col, g]);
    if (w === 2) out.push([col + 1, ""]);
    col += w;
  }
  return out;
}
