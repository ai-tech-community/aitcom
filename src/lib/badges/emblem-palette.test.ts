import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EMBLEM_HUES,
  EMBLEM_TONES,
  emblemPalette,
  oklchToHex,
} from "./emblem-palette";
import {
  AWARD_EMBLEM,
  LIMITED_EDITION_EMBLEM,
  MILESTONE_EMBLEM,
  TRACK_EMBLEMS,
} from "./emblem-shapes";

const CSS = readFileSync(join(__dirname, "../../styles/globals.css"), "utf-8");

/** Every value a token gets in globals.css, in order (light, then dark). */
function tokenValues(name: string): number[] {
  return [...CSS.matchAll(new RegExp(`${name}:\\s*([0-9.]+);`, "g"))].map(
    (match) => Number(match[1]),
  );
}

describe("emblem palette mirrors globals.css", () => {
  it("has every hue token with the same angle", () => {
    const declared = [...CSS.matchAll(/(--emblem-hue-[a-z-]+):\s*([0-9.]+);/g)];
    expect(declared.length).toBeGreaterThan(0);
    expect(
      Object.fromEntries(declared.map((match) => [match[1], Number(match[2])])),
    ).toEqual(EMBLEM_HUES);
  });

  it("covers every emblem style's hue", () => {
    for (const style of [
      ...Object.values(TRACK_EMBLEMS),
      LIMITED_EDITION_EMBLEM,
      AWARD_EMBLEM,
    ]) {
      expect(EMBLEM_HUES[style.hue!], style.hue!).toBeTypeOf("number");
    }
  });

  it("has the light and dark ink and tint tones", () => {
    expect(tokenValues("--emblem-ink-l")).toEqual([
      EMBLEM_TONES.light.ink.l,
      EMBLEM_TONES.dark.ink.l,
    ]);
    expect(tokenValues("--emblem-ink-c")).toEqual([
      EMBLEM_TONES.light.ink.c,
      EMBLEM_TONES.dark.ink.c,
    ]);
    expect(tokenValues("--emblem-tint-l")).toEqual([
      EMBLEM_TONES.light.tint.l,
      EMBLEM_TONES.dark.tint.l,
    ]);
    expect(tokenValues("--emblem-tint-c")).toEqual([
      EMBLEM_TONES.light.tint.c,
      EMBLEM_TONES.dark.tint.c,
    ]);
  });
});

describe("oklchToHex", () => {
  it("converts reference colours", () => {
    expect(oklchToHex(1, 0, 0)).toBe("#ffffff");
    expect(oklchToHex(0, 0, 0)).toBe("#000000");
    // Signal Orange, oklch(0.705 0.213 47.604) = #ff6900 (Tailwind orange-500).
    expect(oklchToHex(0.705, 0.213, 47.604)).toBe("#ff6900");
  });
});

describe("emblemPalette", () => {
  it("gives a track its hue and a milestone no chroma", () => {
    const writer = emblemPalette(TRACK_EMBLEMS.writer, "dark");
    expect(writer.ink).toMatch(/^#[0-9a-f]{6}$/);
    expect(writer.ink).not.toBe(writer.tint);
    const milestone = emblemPalette(MILESTONE_EMBLEM, "dark");
    const [r, g, b] = [1, 3, 5].map((i) => milestone.ink.slice(i, i + 2));
    expect(r).toBe(g);
    expect(g).toBe(b);
  });
});
