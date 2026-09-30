"use client";

import { useEffect, useRef } from "react";
import { gridSizeFor, measureCharCell, type GridSize } from "./measure";
import { useAsciiMotion } from "./use-ascii-motion";

/** One stacked `<pre>` per layer, coloured by a token class. */
export interface AsciiSceneLayer<L extends string> {
  name: L;
  className: string;
}

/**
 * Draws a frame for the measured grid. Must be pure: the same arguments
 * always give the same picture, and every row is `cols` wide.
 */
export type AsciiSceneFrame<L extends string> = (
  tick: number,
  cols: number,
  rows: number,
) => Record<L, readonly string[]>;

export interface AsciiSceneProps<L extends string> {
  layers: readonly AsciiSceneLayer<L>[];
  frame: AsciiSceneFrame<L>;
  frameMs: number;
  /** The reduced-motion frame; animation also starts here. */
  staticTick: number;
  /** Skip drawing when the box is smaller than this many cells. */
  minCols?: number;
  minRows?: number;
  /**
   * Called after each measure with the grid in use (null when the box is
   * below the minimum), so a caller can line an overlay up with the art.
   */
  onGridChange?: (grid: GridSize | null) => void;
  className?: string;
  "data-testid"?: string;
}

/**
 * Decorative, aria-hidden ASCII picture sized to its box. Measures the
 * character grid, then paints `frame(tick, cols, rows)` into stacked layers.
 * Motion policy comes from the shared seam (`useAsciiMotion`): a still
 * frame under reduced motion, paused off-screen and in background tabs.
 * The box's size and font come from `className`.
 */
export function AsciiScene<L extends string>({
  layers,
  frame,
  frameMs,
  staticTick,
  minCols = 10,
  minRows = 4,
  onGridChange,
  className,
  "data-testid": testId,
}: AsciiSceneProps<L>) {
  const boxRef = useRef<HTMLDivElement>(null);
  const preRefs = useRef<Partial<Record<L, HTMLPreElement>>>({});
  const gridChangeRef = useRef(onGridChange);
  useEffect(() => {
    gridChangeRef.current = onGridChange;
  });

  const motion = useAsciiMotion(boxRef, {
    frameMs,
    staticTick,
    measure: (el) => {
      const { cols, rows } = gridSizeFor(
        { width: el.clientWidth, height: el.clientHeight },
        measureCharCell(el),
      );
      const grid = cols >= minCols && rows >= minRows ? { cols, rows } : null;
      gridChangeRef.current?.(grid);
      return grid;
    },
    draw: (tick, { cols, rows }) => {
      const out = frame(tick, cols, rows);
      for (const { name } of layers) {
        const pre = preRefs.current[name];
        if (pre) pre.textContent = out[name].join("\n");
      }
    },
  });

  // New scene input (e.g. different data) must show even while static.
  useEffect(() => motion.redraw(), [frame, motion]);

  return (
    <div
      ref={boxRef}
      aria-hidden="true"
      data-testid={testId}
      className={`pointer-events-none relative select-none ${className ?? ""}`}
    >
      {layers.map(({ name, className: layerClass }) => (
        <pre
          key={name}
          ref={(node) => {
            if (node) preRefs.current[name] = node;
            else delete preRefs.current[name];
          }}
          className={`absolute inset-0 m-0 overflow-hidden font-[inherit] whitespace-pre ${layerClass}`}
        />
      ))}
    </div>
  );
}
