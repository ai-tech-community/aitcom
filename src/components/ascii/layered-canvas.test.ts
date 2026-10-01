import { describe, expect, it } from "vitest";
import { textWidth } from "./cells";
import { LayeredCanvas } from "./layered-canvas";

type L = "a" | "b";
const LAYERS: readonly L[] = ["a", "b"];

describe("LayeredCanvas", () => {
  it("gives a wide glyph two cells, so the row keeps its width", () => {
    const c = new LayeredCanvas<L>(8, 1, LAYERS);
    c.text(1, 0, "東京", "a");
    c.put(5, 0, "x", "b");
    const { a, b } = c.frame();
    expect(a[0]).toBe(" 東京   ");
    expect(textWidth(a[0]!)).toBe(8);
    expect(b[0]).toBe("     x  ");
    expect(textWidth(b[0]!)).toBe(8);
  });

  it("keeps a combining mark with its letter as one cell", () => {
    const c = new LayeredCanvas<L>(4, 1, LAYERS);
    c.text(0, 0, "éte", "a");
    expect(textWidth(c.frame().a[0]!)).toBe(4);
    expect(c.isBlank(3, 0)).toBe(true);
  });

  it("draws wide sprites with transparent edges and opaque inner spaces", () => {
    const c = new LayeredCanvas<L>(6, 1, LAYERS);
    c.text(0, 0, "......", "b");
    c.sprite(0, 0, [" 京 x "], "a");
    const { a, b } = c.frame();
    expect(a[0]).toBe(" 京 x ");
    // Edge cells stay behind; the inner space hides what was there.
    expect(b[0]).toBe(".    .");
    expect(textWidth(a[0]!)).toBe(6);
  });

  it("never lets a wide glyph spill past the right edge", () => {
    const c = new LayeredCanvas<L>(3, 2, LAYERS);
    c.text(2, 0, "東", "a");
    c.put(-1, 0, "x", "a");
    c.put(0, 5, "x", "a");
    const { a } = c.frame();
    expect(a).toHaveLength(2);
    expect(a[0]).toBe("   ");
    expect(textWidth(a[0]!)).toBe(3);
  });

  it("says which layer owns a cell", () => {
    const c = new LayeredCanvas(4, 1, ["a", "b"] as const);
    c.put(0, 0, "x", "a");
    c.put(1, 0, "y", "b");
    expect(c.ownerAt(0, 0)).toBe("a");
    expect(c.ownerAt(1, 0)).toBe("b");
    expect(c.ownerAt(2, 0)).toBeNull();
    expect(c.ownerAt(9, 9)).toBeNull();
  });
});
