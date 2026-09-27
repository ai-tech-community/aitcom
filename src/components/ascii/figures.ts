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
  /** Arm raised on the right (waving, placing, pinning). */
  armUp?: boolean;
  /** Agent only: eyes shut for a frame. */
  blink?: boolean;
  /** Replaces the body row, e.g. a human holding an open book. */
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
    return pose.armUp
      ? [head + "/", BODY_WAVE, legs]
      : [head, pose.body ?? BODY, legs];
  }
  return pose.armUp
    ? [HUMAN_WAVE, BODY_WAVE, legs]
    : [HUMAN_HEAD, pose.body ?? BODY, legs];
}
