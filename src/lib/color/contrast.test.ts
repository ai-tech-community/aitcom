import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  isInCreamBand,
  isInOrangeBand,
  normalizeHexColor,
  oklchOf,
} from "./contrast";

describe("normalizeHexColor", () => {
  it("expands short hex and refuses anything that is not a hex color", () => {
    expect(normalizeHexColor(" #9a3 ")).toBe("#99AA33");
    expect(normalizeHexColor("#9A3412")).toBe("#9A3412");
    expect(normalizeHexColor("9A3412")).toBeNull();
    expect(normalizeHexColor("#xyzxyz")).toBeNull();
    expect(normalizeHexColor("red")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("rates black on white at 21:1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });
});

describe("oklchOf", () => {
  it("reads white as full lightness and no chroma", () => {
    const white = oklchOf("#FFFFFF");
    expect(white.l).toBeCloseTo(1, 3);
    expect(white.c).toBeLessThan(1e-4);
    expect(white.h).toBe(0);
  });

  it("reads #F97316 at Signal Orange's lightness and hue", () => {
    // Signal Orange, oklch(0.705 0.213 47.604), is outside sRGB, so no hex
    // holds it exactly. #F97316 is the in-gamut orange it was drawn from:
    // oklch(0.705 0.187 47.604).
    const orange = oklchOf("#F97316");
    expect(orange.l).toBeCloseTo(0.705, 3);
    expect(orange.c).toBeCloseTo(0.187, 3);
    expect(Math.abs(orange.h - 47.6)).toBeLessThan(1.5);
  });
});

describe("isInOrangeBand", () => {
  it("flags Signal Orange and its darker sRGB neighbour", () => {
    expect(isInOrangeBand("#F97316")).toBe(true);
    expect(isInOrangeBand("#F54A00")).toBe(true);
  });

  it("lets a soft, low-chroma peach through", () => {
    expect(isInOrangeBand("#F4E6DC")).toBe(false);
  });

  it("lets a brick red with hue below the band through", () => {
    expect(isInOrangeBand("#B23A2E")).toBe(false);
  });

  it("lets a blue through", () => {
    expect(isInOrangeBand("#2E5E8C")).toBe(false);
  });
});

describe("isInCreamBand", () => {
  it("flags a near-white peach and a sand", () => {
    expect(isInCreamBand("#FFECE4")).toBe(true);
    expect(isInCreamBand("#F2E8D5")).toBe(true);
  });

  it("lets pure white and neutral grays through", () => {
    expect(isInCreamBand("#FFFFFF")).toBe(false);
    expect(isInCreamBand("#E5E5E5")).toBe(false);
  });

  it("lets the community canvases through", () => {
    expect(isInCreamBand("#E0F4FE")).toBe(false); // Canal, water blue
    expect(isInCreamBand("#E6F8E6")).toBe(false); // Meadow, light green
    expect(isInCreamBand("#181D37")).toBe(false); // Night, deep indigo
  });

  it("lets a near-white pink through", () => {
    expect(isInCreamBand("#FFEBEE")).toBe(false);
  });

  it("lets a dark warm color through", () => {
    expect(isInCreamBand("#8D4540")).toBe(false);
  });
});
