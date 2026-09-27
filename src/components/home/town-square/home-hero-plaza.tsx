"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  gridSizeFor,
  measureCharCell,
  overlapInCells,
} from "@/components/ascii/measure";
import {
  createTownSquare,
  type NoticeBoardContent,
  type SceneLayer,
  type TownSquareFrame,
} from "./town-square-scene";
import { useTownSquare, type TownSquareLayout } from "./use-town-square";

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
  // Night lights: full-strength ink, never orange (the pin owns orange).
  glow: "text-foreground",
  accent: "text-primary",
};

const LAYERS: SceneLayer[] = ["far", "scenery", "people", "glow", "accent"];

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
 *
 * Hidden play: clicking an agent, a lamp or the fountain triggers a small
 * effect (see `town-square-effects.ts`). The pointer is mapped to a grid
 * cell and the scene says what is there; no DOM is added to the art. The
 * keyboard / assistive-tech equivalent is a small group of real buttons
 * that stays visually hidden until one of them has focus, plus a polite
 * live region that says what happened.
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
  const skyRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<Partial<Record<SceneLayer, HTMLPreElement>>>({});
  const [boardBox, setBoardBox] = useState<BoardBox | null>(null);

  const t = useTranslations("hero.play");
  const greetings = useMemo(() => t.raw("greetings") as string[], [t]);
  const messages = useMemo(
    () => ({
      said: (name: string, line: string) => t("said", { name, line }),
      coming: (name: string) => t("coming", { name }),
      nobody: t("nobody"),
      splashed: t("splashed"),
    }),
    [t],
  );
  const observe = useMemo(() => [copyRef], []);

  // Layout, once per size / data change: grid size, the copy's keep-clear
  // zone, the board link and the night sky's box. Frames never read layout.
  const build = useCallback(
    (el: HTMLElement): TownSquareLayout | null => {
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
      const scene = createTownSquare(cols, rows, {
        board,
        safeZone,
        greetings,
      });

      const sky = skyRef.current;
      if (sky) {
        const r = scene.sky;
        sky.hidden = !r;
        if (r) {
          sky.style.left = `${r.x * cell.width}px`;
          sky.style.top = `${r.y * cell.height}px`;
          sky.style.width = `${r.w * cell.width}px`;
          sky.style.height = `${r.h * cell.height}px`;
        }
      }

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
      return { scene, cell };
    },
    [board, greetings],
  );

  const paint = useCallback((frame: TownSquareFrame) => {
    for (const layer of LAYERS) {
      const pre = layerRefs.current[layer];
      if (pre) pre.textContent = frame.layers[layer].join("\n");
    }
    if (skyRef.current) skyRef.current.style.opacity = String(frame.night);
  }, []);

  const { playable, night, announcement, playKind, pointer } = useTownSquare(
    sceneRef,
    { build, paint, observe, greetings, messages },
  );

  const anyPlayable = playable.agent || playable.lamp || playable.fountain;

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
        {...pointer}
        className="relative h-48 font-mono text-[10px] leading-3 select-none sm:absolute sm:inset-0 sm:h-auto sm:[mask-image:linear-gradient(to_right,transparent,black_28%)] sm:text-xs sm:leading-[14px]"
      >
        {/* Night sky: only above the street and right of the copy's
            keep-clear zone (never under the hero text), soft on its left
            edge; its opacity follows the night level. */}
        <div
          ref={skyRef}
          data-testid="town-square-sky"
          hidden
          style={{ opacity: 0 }}
          className="absolute bg-[linear-gradient(to_bottom,var(--color-night-sky)_0%,var(--color-night-sky)_55%,transparent_100%)] [mask-image:linear-gradient(to_right,transparent,black_14rem)]"
        />
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
      {anyPlayable ? (
        // Keyboard / screen-reader equivalent of clicking the art. Hidden
        // until a button in it has focus, so it never clutters the hero.
        <div
          role="group"
          aria-label={t("group")}
          data-testid="town-square-play"
          className="focus-within:bg-background focus-within:border-border sr-only focus-within:not-sr-only focus-within:absolute focus-within:bottom-4 focus-within:left-4 focus-within:z-30 focus-within:flex focus-within:max-w-[calc(100%-2rem)] focus-within:flex-wrap focus-within:gap-2 focus-within:rounded-lg focus-within:border focus-within:p-2 sm:focus-within:left-12"
        >
          {playable.agent ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => playKind("agent")}
            >
              {t("wave")}
            </Button>
          ) : null}
          {playable.lamp ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={night}
              onClick={() => playKind("lamp")}
            >
              {t("night")}
            </Button>
          ) : null}
          {playable.fountain ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => playKind("fountain")}
            >
              {t("splash")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <p role="status" className="sr-only" data-testid="town-square-status">
        {announcement}
      </p>
    </section>
  );
}
