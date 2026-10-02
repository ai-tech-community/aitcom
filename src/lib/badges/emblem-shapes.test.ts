import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BADGE_TRACKS, BADGE_TRACK_IDS } from "./catalog";
import {
  AWARD_EMBLEM,
  EMBLEM_SHAPES,
  LIMITED_EDITION_EMBLEM,
  MILESTONE_EMBLEM,
  TRACK_EMBLEMS,
} from "./emblem-shapes";

const css = readFileSync(join(process.cwd(), "src/styles/globals.css"), "utf8");

function hueToken(name: string): number | null {
  const match = new RegExp(`${name}:\\s*([\\d.]+);`).exec(css);
  return match ? Number(match[1]) : null;
}

describe("emblem shapes", () => {
  it("gives every track its own silhouette, distinct from the other kinds", () => {
    const shapes = BADGE_TRACK_IDS.map((track) => TRACK_EMBLEMS[track].shape);
    expect(new Set(shapes).size).toBe(BADGE_TRACK_IDS.length);
    for (const other of [
      MILESTONE_EMBLEM,
      LIMITED_EDITION_EMBLEM,
      AWARD_EMBLEM,
    ]) {
      expect(shapes).not.toContain(other.shape);
    }
  });

  it("gives every track its own glyph", () => {
    const glyphs = BADGE_TRACK_IDS.map((track) => BADGE_TRACKS[track].glyph);
    expect(new Set(glyphs).size).toBe(BADGE_TRACK_IDS.length);
  });

  it("draws each silhouette as one closed path from the top", () => {
    for (const shape of Object.values(EMBLEM_SHAPES)) {
      expect(shape.d, shape.id).toMatch(/^M[\d.]+ [\d.]+ .* Z$/);
      expect(shape.d, shape.id).not.toMatch(/NaN|Infinity/);
      const [, startX, startY] = /^M([\d.]+) ([\d.]+)/
        .exec(shape.d)!
        .map(Number);
      // Starts at the top, near the centre line, so the progress arc grows
      // from the top like a clock hand.
      expect(startY, shape.id).toBeLessThan(34);
      expect(Math.abs(startX! - 50), shape.id).toBeLessThanOrEqual(10);
      expect(shape.r, shape.id).toBeGreaterThan(0);
    }
  });
});

describe("emblem hues", () => {
  const styles = [
    ...BADGE_TRACK_IDS.map((track) => TRACK_EMBLEMS[track]),
    LIMITED_EDITION_EMBLEM,
    AWARD_EMBLEM,
  ];

  it("defines every hue token, one distinct hue per track", () => {
    const hues = styles.map((style) => hueToken(style.hue!));
    expect(hues).not.toContain(null);
    expect(new Set(hues).size).toBe(styles.length);
  });

  it("never uses Signal Orange's hue band (One Voice Rule)", () => {
    for (const style of styles) {
      const hue = hueToken(style.hue!)!;
      expect(hue < 20 || hue > 80, `${style.hue} = ${hue}`).toBe(true);
    }
  });

  it("keeps milestones neutral", () => {
    expect(MILESTONE_EMBLEM.hue).toBeNull();
  });
});
