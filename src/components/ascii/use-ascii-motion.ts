"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { AsciiMotionController } from "./motion-controller";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export interface AsciiMotionOptions<M> {
  /**
   * Read layout once per mount / resize / font load and return whatever
   * `draw` needs (grid size, safe zones). Return null to skip drawing.
   */
  measure: (el: HTMLElement) => M | null;
  /** Paint `tick` using the last measurement. No layout or style reads. */
  draw: (tick: number, measurement: M) => void;
  frameMs: number;
  /** Frame shown under reduced motion; animation also starts here. */
  staticTick?: number;
  /**
   * Other elements whose size changes should also trigger a re-measure
   * (e.g. a text column the scene must keep clear of).
   */
  observe?: readonly RefObject<HTMLElement | null>[];
}

export interface AsciiMotionHandle {
  /** Re-measure and repaint now, e.g. after the scene's data changed. */
  remeasure: () => void;
}

/**
 * The one motion seam for ASCII scenes. Wires browser signals into
 * `AsciiMotionController`:
 * - `prefers-reduced-motion` (live, via the media-query change event)
 * - IntersectionObserver (pause off-screen)
 * - `visibilitychange` (pause in background tabs)
 * - ResizeObserver + `document.fonts.ready` (re-measure, then redraw)
 */
export function useAsciiMotion<M>(
  ref: RefObject<HTMLElement | null>,
  { measure, draw, frameMs, staticTick = 0, observe }: AsciiMotionOptions<M>,
): AsciiMotionHandle {
  // Latest callbacks without restarting the loop on every render.
  const measureRef = useRef(measure);
  const drawRef = useRef(draw);
  const observeRef = useRef(observe);
  useEffect(() => {
    measureRef.current = measure;
    drawRef.current = draw;
    observeRef.current = observe;
  });

  const measurementRef = useRef<M | null>(null);
  const resizeHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const remeasure = () => {
      measurementRef.current = measureRef.current(el);
    };
    remeasure();

    const reducedMotion =
      typeof window.matchMedia === "function"
        ? window.matchMedia(REDUCED_MOTION_QUERY)
        : null;

    const controller = new AsciiMotionController({
      frameMs,
      staticTick,
      draw: (tick) => {
        const m = measurementRef.current;
        if (m !== null) drawRef.current(tick, m);
      },
      scheduler: {
        request: (cb) => window.requestAnimationFrame(cb),
        cancel: (handle) => window.cancelAnimationFrame(handle),
      },
      initialSignals: {
        prefersReducedMotion: reducedMotion?.matches ?? false,
        documentVisible: document.visibilityState !== "hidden",
      },
    });
    controller.start();

    const onMotionPreference = (event: MediaQueryListEvent) =>
      controller.update({ prefersReducedMotion: event.matches });
    reducedMotion?.addEventListener("change", onMotionPreference);

    const onVisibility = () =>
      controller.update({
        documentVisible: document.visibilityState !== "hidden",
      });
    document.addEventListener("visibilitychange", onVisibility);

    const intersection =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver((entries) => {
            const entry = entries[entries.length - 1];
            if (entry) controller.update({ inViewport: entry.isIntersecting });
          })
        : null;
    intersection?.observe(el);

    const onResize = () => {
      remeasure();
      controller.redraw();
    };
    const resize =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(onResize)
        : null;
    resize?.observe(el);
    for (const extra of observeRef.current ?? []) {
      if (extra.current) resize?.observe(extra.current);
    }
    resizeHandlerRef.current = onResize;

    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) onResize();
    });

    return () => {
      alive = false;
      resizeHandlerRef.current = null;
      controller.dispose();
      reducedMotion?.removeEventListener("change", onMotionPreference);
      document.removeEventListener("visibilitychange", onVisibility);
      intersection?.disconnect();
      resize?.disconnect();
    };
  }, [ref, frameMs, staticTick]);

  return {
    remeasure: () => resizeHandlerRef.current?.(),
  };
}
