"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "@/i18n/navigation";
import {
  gridSizeFor,
  measureCharCell,
  overlapInCells,
} from "@/components/ascii/measure";
import { useAsciiMotion } from "@/components/ascii/use-ascii-motion";
import {
  TOWN_SQUARE_STATIC_TICK,
  createTownSquare,
  type NoticeBoardContent,
  type SceneLayer,
  type TownSquareScene,
} from "./town-square-scene";

const FRAME_MS = 110;
/** Breathing room (in cells) kept clear around the copy column. */
const SAFE_PADDING_CELLS = 2;

/**
 * Colour per layer comes from CSS tokens (currentColor), so dark mode and
 * theme changes need no JS and nothing reads computed style per frame.
 */
const LAYER_CLASS: Record<SceneLayer, string> = {
  far: "text-muted-foreground/40",
  scenery: "text-muted-foreground/70",
  people: "text-foreground/85",
  accent: "text-primary",
};

const LAYERS: SceneLayer[] = ["far", "scenery", "people", "accent"];

export interface BoardLink {
  href: string;
  /** Accessible name, e.g. "Next up: TEDAI Vienna, Sat 10 Oct · 19:00". */
  label: string;
}

interface BoardBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function sameBox(a: BoardBox | null, b: BoardBox | null): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.left === b.left &&
      a.top === b.top &&
      a.width === b.width &&
      a.height === b.height)
  );
}

/**
 * Homepage hero: the copy column (children) and an animated ASCII town
 * square. On phones the square sits below the copy; from `sm` up it fills
 * the section behind the copy, and the scene is told the copy's cell
 * rectangle so it never draws there (plus a left-edge fade).
 *
 * The art is aria-hidden. The notice board's content is exposed through a
 * real link placed over the board (keyboard-focusable, visible focus ring);
 * until it is positioned it stays available as screen-reader text.
 */
export function HomeHeroPlaza({
  board,
  boardLink,
  children,
}: {
  board: NoticeBoardContent;
  boardLink: BoardLink;
  children: ReactNode;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<Partial<Record<SceneLayer, HTMLPreElement>>>({});
  const [boardBox, setBoardBox] = useState<BoardBox | null>(null);

  // Built once per measurement (size, keep-clear zone, data); frames only
  // redraw the moving rows.
  const measure = useCallback(
    (el: HTMLElement): TownSquareScene | null => {
      const cell = measureCharCell(el);
      const box = el.getBoundingClientRect();
      const { cols, rows } = gridSizeFor(box, cell);
      if (cols < 8 || rows < 4) {
        setBoardBox(null);
        return null;
      }
      const copy = copyRef.current?.getBoundingClientRect();
      const safeZone = copy
        ? overlapInCells(box, copy, cell, SAFE_PADDING_CELLS)
        : null;
      const scene = createTownSquare(cols, rows, { board, safeZone });

      const section = sectionRef.current?.getBoundingClientRect();
      const next =
        scene.board && section
          ? {
              left: box.left - section.left + scene.board.x * cell.width,
              top: box.top - section.top + scene.board.y * cell.height,
              width: scene.board.w * cell.width,
              height: scene.board.h * cell.height,
            }
          : null;
      setBoardBox((prev) => (sameBox(prev, next) ? prev : next));
      return scene;
    },
    [board],
  );

  const { remeasure } = useAsciiMotion<TownSquareScene>(sceneRef, {
    frameMs: FRAME_MS,
    staticTick: TOWN_SQUARE_STATIC_TICK,
    observe: [copyRef],
    measure,
    draw: (tick, scene) => {
      const frame = scene.frame(tick);
      for (const layer of LAYERS) {
        const pre = layerRefs.current[layer];
        if (pre) pre.textContent = frame.layers[layer].join("\n");
      }
    },
  });

  // New board data → rebuild the scene (the hook keeps the latest measure).
  useEffect(() => {
    remeasure();
  }, [measure, remeasure]);

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-hidden sm:min-h-[34rem] lg:min-h-[36rem]"
    >
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
        className="pointer-events-none relative h-48 font-mono text-[10px] leading-3 select-none sm:absolute sm:inset-0 sm:h-auto sm:[mask-image:linear-gradient(to_right,transparent,black_28%)] sm:text-xs sm:leading-[14px]"
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
      <Link
        href={boardLink.href}
        data-testid="town-square-board-link"
        style={boardBox ?? undefined}
        className={
          boardBox
            ? "focus-visible:ring-ring/50 hover:bg-foreground/5 absolute z-20 rounded-sm outline-none focus-visible:ring-[3px]"
            : // Not placed (before JS, or the board did not fit): screen-reader
              // text that becomes a visible chip when focused.
              "focus-visible:bg-background focus-visible:ring-ring/50 sr-only rounded-md text-sm outline-none focus-visible:not-sr-only focus-visible:absolute focus-visible:right-4 focus-visible:bottom-4 focus-visible:z-20 focus-visible:px-3 focus-visible:py-2 focus-visible:ring-[3px]"
        }
      >
        {boardBox ? (
          <span className="sr-only">{boardLink.label}</span>
        ) : (
          boardLink.label
        )}
      </Link>
    </section>
  );
}
