/**
 * Hidden "play" effects for the town square: wave to an agent, toggle
 * night, splash the fountain.
 *
 * This module owns the effect *state* — what was triggered, when, and how
 * far along it is — as plain data and pure functions. The scene
 * (`town-square-scene.ts`) owns the *drawing*: it takes this state as frame
 * input, so every effect frame is a deterministic function of
 * `(tick, effects)` and can be tested without a DOM or a clock.
 *
 * Timing is in scene ticks. Under reduced motion the tick never advances,
 * so the renderer marks effects `settled`: the scene then draws the
 * finished state (bubble shown, night fully fallen, one splash frame) and
 * the renderer removes greet/splash on a timer instead.
 */

export type SquareTarget =
  | { kind: "agent"; figureId: string }
  | { kind: "lamp"; index: number }
  | { kind: "fountain"; index: number };

export type SquareTargetKind = SquareTarget["kind"];

interface Timed {
  /** Tick the effect started. */
  since: number;
  /** Draw the finished state, with no animation (reduced motion). */
  settled?: boolean;
}

export interface GreetEffect extends Timed {
  figureId: string;
  /** Rotating greeting counter; the scene picks `line % greetings.length`. */
  line: number;
}

export interface LightingEffect extends Timed {
  /** true: night is falling / has fallen; false: day is breaking. */
  night: boolean;
  /**
   * Night level (0..1) when this toggle happened. A toggle mid-transition
   * carries on from here instead of jumping, so windows never flash.
   */
  from?: number;
}

export interface SplashEffect extends Timed {
  fountain: number;
  /** Tick of the latest burst of droplets (a re-click splashes again). */
  burstSince: number;
}

export interface TownSquareEffects {
  greet?: GreetEffect | null;
  lighting?: LightingEffect | null;
  splash?: SplashEffect | null;
}

export const NO_EFFECTS: TownSquareEffects = Object.freeze({});

// ─── Timeline (ticks) ────────────────────────────────────────────────────────

/** How long a greeting stays up, including its fade. */
export const GREET_TICKS = 40;
const GREET_DIM_AT = 33;
const GREET_FAINT_AT = 37;
/** The neighbour waves back a beat after the agent. */
export const GREET_REPLY_DELAY = 5;
/** Wave arm swings every this many ticks. */
export const WAVE_SWING_TICKS = 3;

/** Windows light one by one over this many ticks; day breaks faster. */
export const NIGHT_FALL_TICKS = 28;
export const DAY_BREAK_TICKS = 16;

/** Droplet arc duration. */
export const SPLASH_BURST_TICKS = 14;
/** Burst age drawn under reduced motion: droplets high in the air. */
export const SPLASH_SETTLED_BURST_AGE = 4;
const SPLASH_WALK_TICKS = 10;
const SPLASH_HOLD_END = 40;
/** Walk over, stand around the fountain, walk back. */
export const SPLASH_TICKS = SPLASH_HOLD_END + SPLASH_WALK_TICKS;

/** Reduced-motion lifetimes (ms) for effects that would otherwise time out. */
export const SETTLED_GREET_MS = 4500;
export const SETTLED_SPLASH_MS = 4500;

// ─── Progress ────────────────────────────────────────────────────────────────

function age(effect: Timed, tick: number): number {
  return tick - effect.since;
}

export type GreetStage = "full" | "dim" | "faint";

/** How visible the greeting bubble is, or null when it is over. */
export function greetStage(
  greet: GreetEffect | null | undefined,
  tick: number,
): GreetStage | null {
  if (!greet) return null;
  if (greet.settled) return "full";
  const a = age(greet, tick);
  if (a < 0 || a >= GREET_TICKS) return null;
  if (a >= GREET_FAINT_AT) return "faint";
  if (a >= GREET_DIM_AT) return "dim";
  return "full";
}

/** True while the waving agent's neighbour is waving back. */
export function greetReplying(
  greet: GreetEffect | null | undefined,
  tick: number,
): boolean {
  if (!greet) return false;
  if (greet.settled) return true;
  const a = age(greet, tick);
  return a >= GREET_REPLY_DELAY && a < GREET_DIM_AT;
}

/** Wave pose: arm up (true) or out (false). Still (up) when settled. */
export function waveArmUp(effect: Timed, tick: number, delay = 0): boolean {
  if (effect.settled) return true;
  return Math.floor((age(effect, tick) - delay) / WAVE_SWING_TICKS) % 2 === 0;
}

/**
 * How much night has fallen: 0 is full day, 1 is full night. Each night
 * detail (a window, a star) switches on at its own threshold, so windows
 * light one by one as this rises and go dark in reverse as it falls.
 */
export function nightLevel(
  lighting: LightingEffect | null | undefined,
  tick: number,
): number {
  if (!lighting) return 0;
  if (lighting.settled) return lighting.night ? 1 : 0;
  const a = Math.max(0, age(lighting, tick));
  // Constant speed from wherever the previous toggle left off.
  if (lighting.night)
    return Math.min(1, (lighting.from ?? 0) + a / NIGHT_FALL_TICKS);
  return Math.max(0, (lighting.from ?? 1) - a / DAY_BREAK_TICKS);
}

export function isNight(effects: TownSquareEffects): boolean {
  return effects.lighting?.night ?? false;
}

/**
 * How far the gatherers have walked toward the fountain: 0 at their own
 * spot, 1 standing around the fountain.
 */
export function splashGather(
  splash: SplashEffect | null | undefined,
  tick: number,
): number {
  if (!splash) return 0;
  if (splash.settled) return 1;
  const a = age(splash, tick);
  if (a < 0 || a >= SPLASH_TICKS) return 0;
  if (a < SPLASH_WALK_TICKS) return a / SPLASH_WALK_TICKS;
  if (a < SPLASH_HOLD_END) return 1;
  return 1 - (a - SPLASH_HOLD_END) / SPLASH_WALK_TICKS;
}

/** Age of the current droplet burst, or null when no droplets fly. */
export function splashBurstAge(
  splash: SplashEffect | null | undefined,
  tick: number,
): number | null {
  if (!splash) return null;
  if (splash.settled) return SPLASH_SETTLED_BURST_AGE;
  const a = tick - splash.burstSince;
  return a >= 0 && a < SPLASH_BURST_TICKS ? a : null;
}

function splashActive(splash: SplashEffect, tick: number): boolean {
  return (
    !!splash.settled ||
    splashGather(splash, tick) > 0 ||
    splashBurstAge(splash, tick) !== null
  );
}

// ─── Events ──────────────────────────────────────────────────────────────────

export interface EffectClock {
  tick: number;
  /** Reduced motion: record the effect as already finished. */
  settled: boolean;
}

/**
 * Apply a click (or its keyboard equivalent) on a target. Pure: returns a
 * new state and never mutates the old one.
 * - agent    → greet it (the greeting line rotates on each wave)
 * - lamp     → toggle night / day
 * - fountain → splash; a re-click while people are still gathered only
 *              throws a fresh burst of droplets, so nobody snaps back home
 */
export function triggerEffect(
  state: TownSquareEffects,
  target: SquareTarget,
  { tick, settled }: EffectClock,
): TownSquareEffects {
  const timing = settled ? { since: tick, settled: true } : { since: tick };
  switch (target.kind) {
    case "agent":
      return {
        ...state,
        greet: {
          ...timing,
          figureId: target.figureId,
          line: (state.greet?.line ?? -1) + 1,
        },
      };
    case "lamp":
      return {
        ...state,
        lighting: {
          ...timing,
          night: !isNight(state),
          from: nightLevel(state.lighting, tick),
        },
      };
    case "fountain": {
      const current = state.splash;
      if (
        current &&
        !settled &&
        current.fountain === target.index &&
        splashActive(current, tick)
      ) {
        return { ...state, splash: { ...current, burstSince: tick } };
      }
      return {
        ...state,
        splash: { ...timing, fountain: target.index, burstSince: tick },
      };
    }
  }
}

/**
 * Collapse every effect to where it ends up, for a change of motion mode
 * (reduced motion switched on or off mid-visit). Tick-based timings would
 * otherwise be measured against a clock that just jumped: night becomes
 * fully night or day (settled, so it holds on any clock) and the timed
 * greet and splash are over.
 */
export function settleEffects(state: TownSquareEffects): TownSquareEffects {
  const lighting = state.lighting;
  if (!lighting && !state.greet && !state.splash) return state;
  return lighting
    ? {
        lighting: {
          night: lighting.night,
          since: lighting.since,
          settled: true,
        },
      }
    : {};
}

/** Remove a finished effect (reduced-motion timers). Night is a toggle. */
export function clearEffect(
  state: TownSquareEffects,
  kind: "greet" | "splash",
): TownSquareEffects {
  if (!state[kind]) return state;
  return { ...state, [kind]: null };
}

// ─── Greetings ───────────────────────────────────────────────────────────────

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

/** A stable, friendly name for an agent figure, e.g. "agent-7". */
export function agentName(figureId: string): string {
  return `agent-${2 + (hashString(figureId) % 98)}`;
}

/**
 * The greeting an agent says for a line counter. Templates may contain
 * `{name}`; they come from the translation files.
 */
export function greetingText(
  figureId: string,
  line: number,
  templates: readonly string[],
): string {
  if (templates.length === 0) return "";
  const i = ((line % templates.length) + templates.length) % templates.length;
  return templates[i]!.replaceAll("{name}", agentName(figureId));
}
