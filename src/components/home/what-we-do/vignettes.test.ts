import { describe, expect, it } from "vitest";
import { VIGNETTES, fitVignette, type VignetteKey } from "./vignettes";

const KEYS = Object.keys(VIGNETTES) as VignetteKey[];

function flat(key: VignetteKey, tick: number): string {
  const f = VIGNETTES[key].frame(tick);
  return f.scenery
    .map((row, y) =>
      [...row]
        .map((c, x) => (f.people[y]![x] !== " " ? f.people[y]![x] : c))
        .join(""),
    )
    .join("\n");
}

describe("vignettes", () => {
  it.each(KEYS)("%s stays inside its bounds on every tick", (key) => {
    const v = VIGNETTES[key];
    for (let tick = 0; tick < 400; tick += 3) {
      const f = v.frame(tick);
      for (const layer of [f.scenery, f.people]) {
        expect(layer).toHaveLength(v.height);
        for (const row of layer) expect(row).toHaveLength(v.width);
      }
    }
  });

  it.each(KEYS)("%s gives each cell to at most one layer", (key) => {
    const f = VIGNETTES[key].frame(VIGNETTES[key].stillTick);
    f.scenery.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== " ") expect(f.people[y]![x]).toBe(" ");
      }),
    );
  });

  it.each(KEYS)(
    "%s shows people and agents together in its still frame",
    (key) => {
      const art = flat(key, VIGNETTES[key].stillTick);
      expect(art).toContain("[•]");
      expect(art).toMatch(/ o[ /]/);
    },
  );

  it.each(KEYS)("%s moves gently between ticks", (key) => {
    const frames = new Set(
      Array.from({ length: 12 }, (_, i) => flat(key, i * 20)),
    );
    expect(frames.size).toBeGreaterThan(1);
  });

  it.each(KEYS)("%s is balanced vertically in its box", (key) => {
    const rows = flat(key, VIGNETTES[key].stillTick).split("\n");
    const filled = rows.map((r) => r.trim() !== "");
    const top = filled.indexOf(true);
    const bottom = rows.length - 1 - filled.lastIndexOf(true);
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1);
  });

  it("is deterministic", () => {
    for (const key of KEYS) expect(flat(key, 77)).toBe(flat(key, 77));
  });
});

describe("fitVignette", () => {
  const frame = VIGNETTES.build.frame(VIGNETTES.build.stillTick);

  it("centres the picture in a larger grid", () => {
    const fit = fitVignette(frame, 60, 15);
    expect(fit.scenery).toHaveLength(15);
    for (const row of [...fit.scenery, ...fit.people])
      expect(row).toHaveLength(60);
    expect(fit.people.join("\n")).toContain("[#]");
  });

  it("crops, never overflows, in a smaller grid", () => {
    const fit = fitVignette(frame, 30, 8);
    expect(fit.scenery).toHaveLength(8);
    for (const row of fit.scenery) expect(row).toHaveLength(30);
  });
});
