"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, RefObject } from "react";
import { cellAtPoint, type CharCell } from "@/components/ascii/measure";
import type { MotionMode } from "@/components/ascii/motion-controller";
import { useAsciiMotion } from "@/components/ascii/use-ascii-motion";
import {
  NO_EFFECTS,
  SETTLED_GREET_MS,
  SETTLED_SPLASH_MS,
  agentName,
  clearEffect,
  greetingText,
  isNight,
  settleEffects,
  triggerEffect,
  type SquareTarget,
  type SquareTargetKind,
  type TownSquareEffects,
} from "./town-square-effects";
import {
  TOWN_SQUARE_STATIC_TICK,
  type TownSquareFrame,
  type TownSquareScene,
} from "./town-square-scene";

const FRAME_MS = 110;
/**
 * How far ahead "wave to an agent" may look for the next agent to walk on
 * when none is on stage — longer than a passer-by's full round trip.
 */
const AGENT_LOOKAHEAD_TICKS = 600;

export interface SquarePlayMessages {
  /** e.g. "agent-7 waves: “hi, I'm agent-7”". */
  said: (name: string, line: string) => string;
  /** The next agent is still walking on; it waves when it arrives. */
  coming: (name: string) => string;
  /** Truly nobody to wave to (e.g. reduced motion, empty frame). */
  nobody: string;
  splashed: string;
}

export type Playable = Record<SquareTargetKind, boolean>;

const NOTHING_PLAYABLE: Playable = {
  agent: false,
  lamp: false,
  fountain: false,
};

function samePlayable(a: Playable, b: Playable): boolean {
  return a.agent === b.agent && a.lamp === b.lamp && a.fountain === b.fountain;
}

export interface TownSquareLayout {
  scene: TownSquareScene;
  cell: CharCell;
}

interface Options {
  /**
   * Layout: read the page once (size, keep-clear zone, overlays) and build
   * the scene, or null when it does not fit. Not called per frame.
   */
  build: (el: HTMLElement) => TownSquareLayout | null;
  /** Paint a frame. Must not read layout. */
  paint: (frame: TownSquareFrame) => void;
  /** Elements whose resize should rebuild the scene (the copy column). */
  observe?: readonly RefObject<HTMLElement | null>[];
  greetings: readonly string[];
  messages: SquarePlayMessages;
}

/**
 * The town square's controller: owns the scene, its motion loop, the
 * current tick and the play effects, and turns clicks or the keyboard
 * controls into effects. The hero component only lays things out and
 * paints what it is handed.
 *
 * - Effects live in a ref the frame loop reads; triggering one repaints at
 *   once and mirrors what assistive tech needs into state (`night` for
 *   `aria-pressed`, `announcement` for a polite live region).
 * - Reduced motion: the tick never advances, so effects are recorded
 *   `settled` (shown finished) and greet/splash are cleared by a timer.
 *   When reduced motion is switched on or off mid-visit the tick jumps, so
 *   every effect is collapsed to its end state first.
 * - Pointer hit-testing runs at most once per animation frame.
 */
export function useTownSquare(
  sceneRef: RefObject<HTMLElement | null>,
  { build, paint, observe, greetings, messages }: Options,
) {
  const scene = useRef<TownSquareScene | null>(null);
  const cell = useRef<CharCell | null>(null);
  const tick = useRef(TOWN_SQUARE_STATIC_TICK);
  const effects = useRef<TownSquareEffects>(NO_EFFECTS);
  const timers = useRef(new Map<"greet" | "splash", number>());

  const [playable, setPlayable] = useState<Playable>(NOTHING_PLAYABLE);
  const [night, setNight] = useState(false);
  const [said, setSaid] = useState({ text: "", count: 0 });

  const cancelTimers = useCallback(() => {
    for (const id of timers.current.values()) window.clearTimeout(id);
    timers.current.clear();
  }, []);

  const measure = useCallback(
    (el: HTMLElement) => {
      const layout = build(el);
      scene.current = layout?.scene ?? null;
      cell.current = layout?.cell ?? null;
      const next = layout?.scene.playable ?? NOTHING_PLAYABLE;
      setPlayable((prev) => (samePlayable(prev, next) ? prev : next));
      return layout?.scene ?? null;
    },
    [build],
  );

  const onModeChange = useCallback(
    (next: MotionMode, previous: MotionMode) => {
      if ((next === "static") === (previous === "static")) return;
      cancelTimers();
      effects.current = settleEffects(effects.current);
    },
    [cancelTimers],
  );

  const motion = useAsciiMotion<TownSquareScene>(sceneRef, {
    frameMs: FRAME_MS,
    staticTick: TOWN_SQUARE_STATIC_TICK,
    observe,
    measure,
    onModeChange,
    draw: (t, s) => {
      tick.current = t;
      paint(s.frame(t, effects.current));
    },
  });

  const { remeasure } = motion;
  // New data or layout function → rebuild the scene.
  useEffect(() => {
    remeasure();
  }, [measure, remeasure]);

  useEffect(() => cancelTimers, [cancelTimers]);

  const announce = useCallback((text: string) => {
    setSaid((prev) => ({ text, count: prev.count + 1 }));
  }, []);

  const clearLater = useCallback(
    (kind: "greet" | "splash", ms: number) => {
      const pending = timers.current;
      const previous = pending.get(kind);
      if (previous !== undefined) window.clearTimeout(previous);
      pending.set(
        kind,
        window.setTimeout(() => {
          pending.delete(kind);
          effects.current = clearEffect(effects.current, kind);
          motion.redraw();
        }, ms),
      );
    },
    [motion],
  );

  /** Apply a target from tick `at` (now, or when an agent walks on). */
  const play = useCallback(
    (target: SquareTarget, at = tick.current) => {
      const settled = motion.isStatic();
      const next = triggerEffect(effects.current, target, {
        tick: at,
        settled,
      });
      effects.current = next;
      motion.redraw();

      switch (target.kind) {
        case "lamp":
          setNight(isNight(next));
          break;
        case "agent": {
          const name = agentName(target.figureId);
          if (at > tick.current) {
            announce(messages.coming(name));
          } else {
            const line = greetingText(
              target.figureId,
              next.greet?.line ?? 0,
              greetings,
            );
            announce(messages.said(name, line));
          }
          if (settled) clearLater("greet", SETTLED_GREET_MS);
          break;
        }
        case "fountain":
          announce(messages.splashed);
          if (settled) clearLater("splash", SETTLED_SPLASH_MS);
          break;
      }
    },
    [motion, greetings, messages, clearLater, announce],
  );

  /** Keyboard path: play with the scene's suggestion for a kind. */
  const playKind = useCallback(
    (kind: SquareTargetKind) => {
      const current = scene.current;
      if (!current) return;
      const suggestion = current.suggestTarget(kind, tick.current, {
        effects: effects.current,
        // Under reduced motion the tick never moves: only who is on stage.
        lookahead: motion.isStatic() ? 0 : AGENT_LOOKAHEAD_TICKS,
      });
      if (suggestion) play(suggestion.target, suggestion.at);
      else if (kind === "agent") announce(messages.nobody);
    },
    [motion, play, announce, messages],
  );

  const targetAt = useCallback((el: HTMLElement, x: number, y: number) => {
    const current = scene.current;
    if (!current || !cell.current) return null;
    const at = cellAtPoint(el.getBoundingClientRect(), cell.current, x, y);
    return at
      ? current.targetAt(at.col, at.row, tick.current, effects.current)
      : null;
  }, []);

  // Hover hint, at most one hit-test per animation frame.
  const hover = useRef<{ el: HTMLElement; x: number; y: number } | null>(null);
  const hoverFrame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (hoverFrame.current !== null)
        window.cancelAnimationFrame(hoverFrame.current);
    },
    [],
  );

  const pointer = useMemo(
    () => ({
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        hover.current = {
          el: event.currentTarget,
          x: event.clientX,
          y: event.clientY,
        };
        if (hoverFrame.current !== null) return;
        hoverFrame.current = window.requestAnimationFrame(() => {
          hoverFrame.current = null;
          const h = hover.current;
          if (h) h.el.style.cursor = targetAt(h.el, h.x, h.y) ? "pointer" : "";
        });
      },
      onPointerLeave: (event: PointerEvent<HTMLElement>) => {
        hover.current = null;
        event.currentTarget.style.cursor = "";
      },
      onClick: (event: MouseEvent<HTMLElement>) => {
        const target = targetAt(
          event.currentTarget,
          event.clientX,
          event.clientY,
        );
        if (target) play(target);
      },
    }),
    [targetAt, play],
  );

  // Alternate an invisible zero-width space so repeating the same line
  // (a second splash) still changes the live region and is re-announced.
  const announcement = said.text
    ? said.text + (said.count % 2 === 0 ? "​" : "")
    : "";

  return { remeasure, playable, night, announcement, playKind, pointer };
}
