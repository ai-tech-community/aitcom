import { describe, expect, it } from "vitest";
import { cellAtPoint, gridSizeFor } from "./measure";

const CELL = { width: 7.5, height: 14 };
const BOX = { left: 100, top: 50, width: 750, height: 280 };

describe("cellAtPoint", () => {
  it("maps a point to the cell under it", () => {
    expect(cellAtPoint(BOX, CELL, 100, 50)).toEqual({ col: 0, row: 0 });
    expect(cellAtPoint(BOX, CELL, 100 + 7.5 * 3 + 1, 50 + 14 * 2 + 13)).toEqual(
      { col: 3, row: 2 },
    );
  });

  it("returns null outside the box", () => {
    expect(cellAtPoint(BOX, CELL, 99, 60)).toBeNull();
    expect(cellAtPoint(BOX, CELL, 120, 49)).toBeNull();
    expect(cellAtPoint(BOX, CELL, 850, 60)).toBeNull();
    expect(cellAtPoint(BOX, CELL, 120, 330)).toBeNull();
  });

  it("agrees with the grid size for the last full cell", () => {
    const { cols, rows } = gridSizeFor(BOX, CELL);
    const last = cellAtPoint(BOX, CELL, 100 + 749, 50 + 279);
    expect(last).toEqual({ col: cols - 1, row: rows - 1 });
  });
});
