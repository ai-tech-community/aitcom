/**
 * The two figures of the town square, shared by every ASCII scene on the
 * homepage: humans `o` and agents `[•]`, each 3 cells wide and 3 tall.
 * Agents are drawn as peers of people, in the same scale and stance.
 */

export type FigureKind = "human" | "agent";

export const FIGURE_W = 3;
export const FIGURE_H = 3;

export const HUMAN_HEAD = " o ";
export const HUMAN_WAVE = " o/";
export const AGENT_HEAD = "[•]";
export const AGENT_BLINK = "[-]";
export const BODY = "/|\\";
export const BODY_WAVE = "/| ";
export const LEGS = "/ \\";
export const LEGS_STEP = " |\\";

export interface FigurePose {
  walking?: boolean;
  /**
   * A raised arm: `up` is the top of a wave, `out` the arm swung level on
   * the way down. Omit for arms at rest.
   */
  arm?: "up" | "out";
  /**
   * Which arm waves (default right). Humans only: an agent's head fills its
   * sprite, so an agent always waves with its right arm, reaching one cell
   * past the sprite.
   */
  side?: "left" | "right";
  /** Agent only: eyes shut for a frame. */
  blink?: boolean;
  /** Replaces the body row at rest, e.g. a human holding an open book. */
  body?: string;
}

/** A standing, walking or waving figure; `tick` drives the stride. */
export function figure(
  kind: FigureKind,
  tick: number,
  pose: FigurePose = {},
): string[] {
  const legs = pose.walking && tick % 2 === 1 ? LEGS_STEP : LEGS;
  if (kind === "agent") {
    const head = pose.blink ? AGENT_BLINK : AGENT_HEAD;
    if (pose.arm === "up") return [head + "/", BODY_WAVE, legs];
    if (pose.arm === "out") return [head, "/|-", legs];
    return [head, pose.body ?? BODY, legs];
  }
  if (pose.side === "left") {
    if (pose.arm === "up") return ["\\o ", " |\\", legs];
    if (pose.arm === "out") return [HUMAN_HEAD, "-|\\", legs];
  } else {
    if (pose.arm === "up") return [HUMAN_WAVE, BODY_WAVE, legs];
    if (pose.arm === "out") return [HUMAN_HEAD, "/|-", legs];
  }
  return [HUMAN_HEAD, pose.body ?? BODY, legs];
}
