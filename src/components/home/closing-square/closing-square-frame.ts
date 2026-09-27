import type { AsciiSceneFrame } from "@/components/ascii/ascii-scene";
import {
  createTownSquare,
  type TownSquareScene,
} from "@/components/home/town-square/town-square-scene";
import type { TownSquareEffects } from "@/components/home/town-square/town-square-effects";

/**
 * The layers the closing strip paints: the hero square's layers minus
 * `accent`. The strip has no notice board, so it never spends orange; the
 * footer's wordmark dot keeps the screen's one orange (One Voice Rule).
 */
export type ClosingSquareLayer = "far" | "scenery" | "people" | "glow";

/**
 * Evening on the square: every window and lamp already lit. `settled`
 * means the scene draws the finished state instead of animating the
 * lights coming on, so the strip is calm from the first frame.
 */
export const CLOSING_SQUARE_EVENING: TownSquareEffects = Object.freeze({
  lighting: { since: 0, night: true, settled: true },
});

/** A different seed from the hero, so the end of the page is another corner of the square. */
export const CLOSING_SQUARE_SEED = 7;

/** The hero's still frame is a busy moment; the strip rests on a quieter one. */
export const CLOSING_SQUARE_STATIC_TICK = 40;

/**
 * Frame function for `AsciiScene`: the town square at evening, without a
 * notice board. The scene is built once per grid size (layout and static
 * cells are precomputed by `createTownSquare`) and reused for every tick.
 */
export function createClosingSquareFrame(): AsciiSceneFrame<ClosingSquareLayer> {
  let cached: { cols: number; rows: number; scene: TownSquareScene } | null =
    null;
  return (tick, cols, rows) => {
    if (cached?.cols !== cols || cached.rows !== rows) {
      cached = {
        cols,
        rows,
        scene: createTownSquare(cols, rows, {
          board: null,
          seed: CLOSING_SQUARE_SEED,
        }),
      };
    }
    return cached.scene.frame(tick, CLOSING_SQUARE_EVENING).layers;
  };
}
