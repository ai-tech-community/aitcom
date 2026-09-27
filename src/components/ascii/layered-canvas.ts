import { textCells } from "./cells";

/**
 * A fixed-size character grid where every cell belongs to at most one named
 * layer, so a renderer can colour each layer from a CSS token. Writes outside
 * the grid are ignored, which lets scenes draw without bounds checks.
 * Text is laid out in monospace cells (see `cells.ts`): a wide glyph takes
 * two cells, so every row stays exactly `width` cells wide on screen.
 */
export class LayeredCanvas<L extends string> {
  private chars: string[][];
  private owner: (L | null)[][];

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly layerNames: readonly L[],
  ) {
    const w = Math.max(0, width);
    const h = Math.max(0, height);
    this.chars = Array.from({ length: h }, () => Array<string>(w).fill(" "));
    this.owner = Array.from({ length: h }, () => Array<L | null>(w).fill(null));
  }

  put(x: number, y: number, ch: string, layer: L): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.chars[y]![x] = ch;
    // "" is the trailing half of a wide glyph: owned, but prints nothing.
    this.owner[y]![x] = ch === " " ? null : layer;
  }

  /**
   * Write text by grapheme. A wide glyph owns its cell and the next one is
   * left empty ("") so the row keeps its visual width.
   */
  text(x: number, y: number, s: string, layer: L): void {
    for (const [col, g] of textCells(x, s, this.width))
      this.put(col, y, g, layer);
  }

  /**
   * Draw lines at (x, y). Spaces outside each line's first..last glyph are
   * transparent; spaces inside are opaque, so a thing hides what is behind.
   */
  sprite(x: number, y: number, lines: readonly string[], layer: L): void {
    lines.forEach((line, dy) => {
      const cells = textCells(x, line, this.width);
      const first = cells.findIndex(([, g]) => g !== " ");
      if (first < 0) return;
      let last = cells.length - 1;
      while (cells[last]![1] === " ") last--;
      for (let i = first; i <= last; i++) {
        const [col, g] = cells[i]!;
        this.put(col, y + dy, g, layer);
      }
    });
  }

  /** True when nothing (not even an opaque space) owns this cell. */
  isBlank(x: number, y: number): boolean {
    return this.owner[y]?.[x] === null && this.chars[y]?.[x] === " ";
  }

  frame(): Record<L, string[]> {
    const out = Object.fromEntries(
      this.layerNames.map((l) => [l, [] as string[]]),
    ) as Record<L, string[]>;
    for (let y = 0; y < this.chars.length; y++) {
      for (const layer of this.layerNames) {
        let row = "";
        for (let x = 0; x < this.chars[y]!.length; x++)
          row += this.owner[y]![x] === layer ? this.chars[y]![x]! : " ";
        out[layer].push(row);
      }
    }
    return out;
  }
}
