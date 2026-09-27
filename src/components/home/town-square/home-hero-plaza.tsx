"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  cellAtPoint,
  gridSizeFor,
  measureCharCell,
  overlapInCells,
  type CharCell,
} from "@/components/ascii/measure";
import { useAsciiMotion } from "@/components/ascii/use-ascii-motion";
import {
  TOWN_SQUARE_STATIC_TICK,
  createTownSquare,
  type NoticeBoardContent,
  type SceneLayer,
  type TownSquareScene,
} from "./town-square-scene";
import {
  NO_EFFECTS,
  type SquareTargetKind,
  type TownSquareEffects,
} from "./town-square-effects";
import { useSquarePlay } from "./use-square-play";

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
  // Night lights: full-strength ink, never orange (the pin owns orange).
  glow: "text-foreground",
  accent: "text-primary",
};

const LAYERS: SceneLayer[] = ["far", "scenery", "people", "glow", "accent"];

type Playable = Record<SquareTargetKind, boolean>;

const NOTHING_PLAYABLE: Playable = {
  agent: false,
  lamp: false,
  fountain: false,
};

function samePlayable(a: Playable, b: Playable): boolean {
  return a.agent === b.agent && a.lamp === b.lamp && a.fountain === b.fountain;
}

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
  const layerRefs = useRef<Partial<Record<SceneLayer, HTMLPreElement>>>({});
  const [boardBox, setBoardBox] = useState<BoardBox | null>(null);
  const [playable, setPlayable] = useState<Playable>(NOTHING_PLAYABLE);

  // Last measurement and last painted tick, for hit-testing and play.
  const sceneObj = useRef<TownSquareScene | null>(null);
  const cellSize = useRef<CharCell | null>(null);
  const tickRef = useRef(TOWN_SQUARE_STATIC_TICK);
  const effectsRef = useRef<TownSquareEffects>(NO_EFFECTS);

  const t = useTranslations("hero.play");
  const greetings = useMemo(() => t.raw("greetings") as string[], [t]);
  const messages = useMemo(
    () => ({
      said: (name: string, line: string) => t("said", { name, line }),
      splashed: t("splashed"),
    }),
    [t],
  );

  // Built once per measurement (size, keep-clear zone, data); frames only
  // redraw the moving rows.
  const measure = useCallback(
    (el: HTMLElement): TownSquareScene | null => {
      const cell = measureCharCell(el);
      const box = el.getBoundingClientRect();
      const { cols, rows } = gridSizeFor(box, cell);
      if (cols < 8 || rows < 4) {
        sceneObj.current = null;
        setBoardBox(null);
        setPlayable((prev) =>
          samePlayable(prev, NOTHING_PLAYABLE) ? prev : NOTHING_PLAYABLE,
        );
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
      sceneObj.current = scene;
      cellSize.current = cell;
      const nextPlayable: Playable = {
        agent: !!scene.defaultTarget("agent", tickRef.current),
        lamp: scene.lamps.length > 0,
        fountain: scene.fountains.length > 0,
      };
      setPlayable((prev) =>
        samePlayable(prev, nextPlayable) ? prev : nextPlayable,
      );

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
    [board, greetings],
  );

  const motion = useAsciiMotion<TownSquareScene>(sceneRef, {
    frameMs: FRAME_MS,
    staticTick: TOWN_SQUARE_STATIC_TICK,
    observe: [copyRef],
    measure,
    draw: (tick, scene) => {
      tickRef.current = tick;
      const frame = scene.frame(tick, effectsRef.current);
      for (const layer of LAYERS) {
        const pre = layerRefs.current[layer];
        if (pre) pre.textContent = frame.layers[layer].join("\n");
      }
    },
  });

  const { remeasure } = motion;
  // New board data → rebuild the scene (the hook keeps the latest measure).
  useEffect(() => {
    remeasure();
  }, [measure, remeasure]);

  const { night, announcement, play, playKind } = useSquarePlay({
    effects: effectsRef,
    motion,
    scene: sceneObj,
    tick: tickRef,
    greetings,
    messages,
  });

  const targetAt = useCallback((event: MouseEvent<HTMLElement>) => {
    const scene = sceneObj.current;
    const cell = cellSize.current;
    if (!scene || !cell) return null;
    const at = cellAtPoint(
      event.currentTarget.getBoundingClientRect(),
      cell,
      event.clientX,
      event.clientY,
    );
    return at
      ? scene.targetAt(at.col, at.row, tickRef.current, effectsRef.current)
      : null;
  }, []);

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
        // Hint only: a pointer cursor over things you can play with.
        onPointerMove={(event) => {
          event.currentTarget.style.cursor = targetAt(event) ? "pointer" : "";
        }}
        onPointerLeave={(event) => {
          event.currentTarget.style.cursor = "";
        }}
        onClick={(event) => {
          const target = targetAt(event);
          if (target) play(target);
        }}
        className="relative h-48 font-mono text-[10px] leading-3 select-none sm:absolute sm:inset-0 sm:h-auto sm:[mask-image:linear-gradient(to_right,transparent,black_28%)] sm:text-xs sm:leading-[14px]"
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
