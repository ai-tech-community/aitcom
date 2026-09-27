"use client";

import { useRef, type ReactNode } from "react";
import {
  gridSizeFor,
  measureCharCell,
  overlapInCells,
  type CellRect,
} from "@/components/ascii/measure";
import { useAsciiMotion } from "@/components/ascii/use-ascii-motion";
import {
  TOWN_SQUARE_STATIC_TICK,
  renderTownSquare,
  type NoticeBoardContent,
  type SceneLayer,
} from "./town-square-scene";

const FRAME_MS = 110;
/** Breathing room (in cells) kept clear around the copy column. */
const SAFE_PADDING_CELLS = 2;

interface SceneMeasurement {
  cols: number;
  rows: number;
  safeZone: CellRect | null;
}

/**
 * Colour per layer comes from CSS tokens (currentColor), so dark mode and
 * theme changes need no JS and nothing reads computed style per frame.
 */
const LAYER_CLASS: Record<SceneLayer, string> = {
  scenery: "text-muted-foreground/70",
  people: "text-foreground/85",
  accent: "text-primary",
};

const LAYERS: SceneLayer[] = ["scenery", "people", "accent"];

/**
 * Homepage hero: the copy column (children) over an animated ASCII town
 * square. On phones the square sits below the copy; from `sm` up it fills
 * the section behind the copy, and the scene is told the copy's cell
 * rectangle so it never draws there (plus a left-edge fade).
 */
export function HomeTownSquareHero({
  board,
  children,
}: {
  board: NoticeBoardContent;
  children: ReactNode;
}) {
  const copyRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<Partial<Record<SceneLayer, HTMLPreElement>>>({});

  useAsciiMotion<SceneMeasurement>(sceneRef, {
    frameMs: FRAME_MS,
    staticTick: TOWN_SQUARE_STATIC_TICK,
    measure: (el) => {
      const cell = measureCharCell(el);
      const box = el.getBoundingClientRect();
      const { cols, rows } = gridSizeFor(box, cell);
      if (cols < 8 || rows < 4) return null;
      const copy = copyRef.current?.getBoundingClientRect();
      const safeZone = copy
        ? overlapInCells(box, copy, cell, SAFE_PADDING_CELLS)
        : null;
      return { cols, rows, safeZone };
    },
    draw: (tick, { cols, rows, safeZone }) => {
      const frame = renderTownSquare(tick, cols, rows, { board, safeZone });
      for (const layer of LAYERS) {
        const pre = layerRefs.current[layer];
        if (pre) pre.textContent = frame.layers[layer].join("\n");
      }
    },
  });

  return (
    <section className="relative isolate overflow-hidden sm:min-h-[34rem] lg:min-h-[36rem]">
      <div
        ref={copyRef}
        className="relative z-10 px-4 pt-10 pb-6 sm:max-w-[44rem] sm:px-12 sm:pt-16 sm:pb-12"
      >
        {children}
      </div>
      <div
        ref={sceneRef}
        aria-hidden="true"
        data-testid="town-square-scene"
        className="pointer-events-none relative h-44 font-mono text-[10px] leading-3 select-none sm:absolute sm:inset-0 sm:h-auto sm:[mask-image:linear-gradient(to_right,transparent,black_28%)] sm:text-xs sm:leading-[14px]"
      >
        {LAYERS.map((layer) => (
          <pre
            key={layer}
            ref={(node) => {
              if (node) layerRefs.current[layer] = node;
              else delete layerRefs.current[layer];
            }}
            className={`absolute inset-0 m-0 overflow-hidden font-[inherit] whitespace-pre ${LAYER_CLASS[layer]}`}
          />
        ))}
      </div>
    </section>
  );
}
