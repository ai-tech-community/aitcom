import { describe, expect, it } from "vitest";
import {
  DAY_BREAK_TICKS,
  GREET_REPLY_DELAY,
  GREET_TICKS,
  NIGHT_FALL_TICKS,
  NO_EFFECTS,
  SPLASH_BURST_TICKS,
  SPLASH_SETTLED_BURST_AGE,
  SPLASH_TICKS,
  agentName,
  clearEffect,
  greetReplying,
  greetStage,
  greetingText,
  isNight,
  nightLevel,
  splashBurstAge,
  splashGather,
  triggerEffect,
  type TownSquareEffects,
} from "./town-square-effects";

const LIVE = { tick: 100, settled: false };
const STILL = { tick: 100, settled: true };

describe("greeting lifecycle", () => {
  const state = triggerEffect(
    NO_EFFECTS,
    { kind: "agent", figureId: "0:0:1" },
    LIVE,
  );

  it("shows, dims, fades and ends", () => {
    expect(greetStage(state.greet, 99)).toBeNull();
    expect(greetStage(state.greet, 100)).toBe("full");
    expect(greetStage(state.greet, 100 + GREET_TICKS - 5)).toBe("dim");
    expect(greetStage(state.greet, 100 + GREET_TICKS - 1)).toBe("faint");
    expect(greetStage(state.greet, 100 + GREET_TICKS)).toBeNull();
  });

  it("has the neighbour wave back a beat later", () => {
    expect(greetReplying(state.greet, 100)).toBe(false);
    expect(greetReplying(state.greet, 100 + GREET_REPLY_DELAY)).toBe(true);
  });

  it("rotates the line on every wave", () => {
    const again = triggerEffect(
      state,
      { kind: "agent", figureId: "1:0:0" },
      { tick: 130, settled: false },
    );
    expect(state.greet?.line).toBe(0);
    expect(again.greet?.line).toBe(1);
    expect(again.greet?.figureId).toBe("1:0:0");
  });

  it("stays fully shown under reduced motion until cleared", () => {
    const still = triggerEffect(
      NO_EFFECTS,
      { kind: "agent", figureId: "0:0:1" },
      STILL,
    );
    expect(greetStage(still.greet, 100 + 10_000)).toBe("full");
    expect(greetReplying(still.greet, 100)).toBe(true);
    expect(clearEffect(still, "greet").greet).toBeNull();
  });
});

describe("night lifecycle", () => {
  it("falls gradually and breaks again on the next toggle", () => {
    const dusk = triggerEffect(NO_EFFECTS, { kind: "lamp", index: 0 }, LIVE);
    expect(isNight(dusk)).toBe(true);
    expect(nightLevel(dusk.lighting, 100)).toBe(0);
    expect(nightLevel(dusk.lighting, 100 + NIGHT_FALL_TICKS / 2)).toBeCloseTo(
      0.5,
    );
    expect(nightLevel(dusk.lighting, 100 + NIGHT_FALL_TICKS)).toBe(1);

    const dawn = triggerEffect(
      dusk,
      { kind: "lamp", index: 1 },
      { tick: 200, settled: false },
    );
    expect(isNight(dawn)).toBe(false);
    expect(nightLevel(dawn.lighting, 200)).toBe(1);
    expect(nightLevel(dawn.lighting, 200 + DAY_BREAK_TICKS)).toBe(0);
  });

  it("switches instantly under reduced motion", () => {
    const dark = triggerEffect(NO_EFFECTS, { kind: "lamp", index: 0 }, STILL);
    expect(nightLevel(dark.lighting, 100)).toBe(1);
    const light = triggerEffect(dark, { kind: "lamp", index: 0 }, STILL);
    expect(nightLevel(light.lighting, 100)).toBe(0);
  });

  it("is plain day with no lighting effect", () => {
    expect(nightLevel(undefined, 5)).toBe(0);
    expect(isNight(NO_EFFECTS)).toBe(false);
  });

  it("is never cleared by the reduced-motion timer (it is a toggle)", () => {
    const dark = triggerEffect(NO_EFFECTS, { kind: "lamp", index: 0 }, STILL);
    expect(clearEffect(dark, "greet")).toBe(dark);
  });
});

describe("splash lifecycle", () => {
  const splash = triggerEffect(
    NO_EFFECTS,
    { kind: "fountain", index: 0 },
    LIVE,
  );

  it("walks people over, holds, walks them back", () => {
    expect(splashGather(splash.splash, 100)).toBe(0);
    expect(splashGather(splash.splash, 105)).toBeGreaterThan(0);
    expect(splashGather(splash.splash, 120)).toBe(1);
    expect(splashGather(splash.splash, 100 + SPLASH_TICKS - 3)).toBeLessThan(1);
    expect(splashGather(splash.splash, 100 + SPLASH_TICKS)).toBe(0);
  });

  it("throws droplets for a short burst", () => {
    expect(splashBurstAge(splash.splash, 100)).toBe(0);
    expect(splashBurstAge(splash.splash, 100 + SPLASH_BURST_TICKS)).toBeNull();
  });

  it("a second click only throws fresh droplets while people are there", () => {
    const again = triggerEffect(
      splash,
      { kind: "fountain", index: 0 },
      { tick: 125, settled: false },
    );
    expect(again.splash?.since).toBe(100);
    expect(again.splash?.burstSince).toBe(125);
    expect(splashGather(again.splash, 125)).toBe(1);
  });

  it("starts over once the last splash is done", () => {
    const later = triggerEffect(
      splash,
      { kind: "fountain", index: 0 },
      { tick: 100 + SPLASH_TICKS + 1, settled: false },
    );
    expect(later.splash?.since).toBe(100 + SPLASH_TICKS + 1);
  });

  it("is one still frame under reduced motion", () => {
    const still = triggerEffect(
      NO_EFFECTS,
      { kind: "fountain", index: 0 },
      STILL,
    );
    expect(splashGather(still.splash, 100)).toBe(1);
    expect(splashBurstAge(still.splash, 100)).toBe(SPLASH_SETTLED_BURST_AGE);
    expect(splashBurstAge(still.splash, 9_999)).toBe(SPLASH_SETTLED_BURST_AGE);
  });
});

describe("triggerEffect", () => {
  it("never mutates the previous state", () => {
    const before: TownSquareEffects = Object.freeze({});
    const after = triggerEffect(before, { kind: "lamp", index: 0 }, LIVE);
    expect(before).toEqual({});
    expect(after).not.toBe(before);
  });

  it("keeps effects independent", () => {
    let s = triggerEffect(NO_EFFECTS, { kind: "lamp", index: 0 }, LIVE);
    s = triggerEffect(s, { kind: "fountain", index: 0 }, LIVE);
    s = triggerEffect(s, { kind: "agent", figureId: "a" }, LIVE);
    expect(s.lighting?.night).toBe(true);
    expect(s.splash).toBeTruthy();
    expect(s.greet).toBeTruthy();
  });
});

describe("greetings", () => {
  it("gives each agent a stable, short name", () => {
    expect(agentName("0:0:1")).toBe(agentName("0:0:1"));
    expect(agentName("0:0:1")).toMatch(/^agent-\d{1,2}$/);
  });

  it("fills in the name and wraps the line counter", () => {
    const lines = ["hi, I'm {name}", "hello!"];
    expect(greetingText("x", 0, lines)).toBe(`hi, I'm ${agentName("x")}`);
    expect(greetingText("x", 1, lines)).toBe("hello!");
    expect(greetingText("x", 2, lines)).toBe(`hi, I'm ${agentName("x")}`);
    expect(greetingText("x", 0, [])).toBe("");
  });
});
