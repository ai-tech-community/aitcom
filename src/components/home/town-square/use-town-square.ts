"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { AsciiMotionHandle } from "@/components/ascii/use-ascii-motion";
import {
  SETTLED_GREET_MS,
  SETTLED_SPLASH_MS,
  agentName,
  clearEffect,
  greetingText,
  isNight,
  triggerEffect,
  type SquareTarget,
  type SquareTargetKind,
  type TownSquareEffects,
} from "./town-square-effects";
import type { TownSquareScene } from "./town-square-scene";

export interface SquarePlayMessages {
  /** e.g. "agent-7 waves: “hi, I'm agent-7”". */
  said: (name: string, line: string) => string;
  splashed: string;
}

interface Options {
  /** Effect state read by the scene's `draw` on every frame. */
  effects: RefObject<TownSquareEffects>;
  motion: AsciiMotionHandle;
  scene: RefObject<TownSquareScene | null>;
  /** Tick of the last painted frame. */
  tick: RefObject<number>;
  greetings: readonly string[];
  messages: SquarePlayMessages;
}

/**
 * Turns clicks (and the keyboard controls) into scene effects. Keeps the
 * effect state in a ref the frame loop reads, repaints at once, and mirrors
 * what assistive tech needs into React state: whether it is night (for
 * `aria-pressed`) and a short announcement for a polite live region.
 *
 * Under reduced motion the tick never advances, so effects are recorded as
 * `settled` (shown finished, no animation) and greet/splash are removed by
 * a timer instead of timing out on their own.
 */
export function useSquarePlay({
  effects,
  motion,
  scene,
  tick,
  greetings,
  messages,
}: Options) {
  const [night, setNight] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const timers = useRef(new Map<"greet" | "splash", number>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending.values()) window.clearTimeout(id);
      pending.clear();
    };
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
    [effects, motion],
  );

  const play = useCallback(
    (target: SquareTarget) => {
      const settled = motion.isStatic();
      const next = triggerEffect(effects.current, target, {
        tick: tick.current,
        settled,
      });
      effects.current = next;
      motion.redraw();

      switch (target.kind) {
        case "lamp":
          setNight(isNight(next));
          break;
        case "agent": {
          const line = greetingText(
            target.figureId,
            next.greet?.line ?? 0,
            greetings,
          );
          setAnnouncement(messages.said(agentName(target.figureId), line));
          if (settled) clearLater("greet", SETTLED_GREET_MS);
          break;
        }
        case "fountain":
          setAnnouncement(messages.splashed);
          if (settled) clearLater("splash", SETTLED_SPLASH_MS);
          break;
      }
    },
    [effects, motion, tick, greetings, messages, clearLater],
  );

  /** Keyboard path: play with the scene's suggested target of a kind. */
  const playKind = useCallback(
    (kind: SquareTargetKind) => {
      const target = scene.current?.defaultTarget(
        kind,
        tick.current,
        effects.current,
      );
      if (target) play(target);
    },
    [scene, tick, effects, play],
  );

  return { night, announcement, play, playKind };
}
