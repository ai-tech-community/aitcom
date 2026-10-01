"use client";

import { useCallback, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  AsciiScene,
  type AsciiSceneLayer,
} from "@/components/ascii/ascii-scene";
import type { GridSize } from "@/components/ascii/measure";
import {
  MIN_STREET_ROWS,
  STREET_STILL_TICK,
  communityStreetFrame,
  planStreet,
  streetRow,
  type StreetHouse,
  type StreetLayer,
} from "./community-street-scene";
import { cn } from "@/lib/utils";

const FRAME_MS = 160;

/** Same token colours as the homepage square; lit windows at full ink. */
const LAYERS: readonly AsciiSceneLayer<StreetLayer>[] = [
  { name: "far", className: "text-muted-foreground/40" },
  { name: "scenery", className: "text-muted-foreground/70" },
  { name: "people", className: "text-foreground/85" },
  { name: "glow", className: "text-foreground" },
];

function sameGrid(a: GridSize | null, b: GridSize | null) {
  return a === b || (!!a && !!b && a.cols === b.cols && a.rows === b.rows);
}

/**
 * The street of community houses, with an empty lot at its end. Decorative
 * (aria-hidden): the directory grid carries every fact as text and the
 * page's "Start a community" button is the keyboard path to the lot.
 * Pointing at a house marks it (the caller decides when to let go, e.g.
 * when the pointer leaves the whole street area); clicking or tapping
 * opens it (a real link, so middle-click works, but out of the tab order);
 * the lot starts a community. Hit areas follow the same plan the scene
 * draws.
 */
export function CommunityStreet({
  houses,
  activeSlug,
  onActiveChange,
  reserve = 0,
  lotLabel = null,
  onLotClick,
  night = false,
  className,
}: {
  houses: readonly StreetHouse[];
  activeSlug: string | null;
  onActiveChange: (slug: string | null) => void;
  /** Share of the width kept free on the left (see `planStreet`). */
  reserve?: number;
  lotLabel?: string | null;
  onLotClick?: () => void;
  /** Stars come out (Amsterdam night). */
  night?: boolean;
  className?: string;
}) {
  const [grid, setGrid] = useState<GridSize | null>(null);
  const onGridChange = useCallback(
    (next: GridSize | null) =>
      setGrid((prev) => (sameGrid(prev, next) ? prev : next)),
    [],
  );
  const frame = useCallback(
    (tick: number, cols: number, rows: number) =>
      communityStreetFrame(houses, cols, rows, {
        tick,
        activeSlug,
        reserve,
        lotLabel,
        night,
      }),
    [houses, activeSlug, reserve, lotLabel, night],
  );
  const plan = grid
    ? planStreet(grid.cols, houses.length, { reserve, lot: !!lotLabel })
    : null;
  const shown = plan ? houses.slice(0, plan.houses) : [];

  return (
    <div className={cn("relative", className)}>
      {/* Night sky: the illustration tint, only above the street and right
          of the headline's strip, fading in at its left edge. */}
      {grid && plan ? (
        <div
          aria-hidden="true"
          data-testid="street-night-sky"
          className="absolute top-0 right-0 bg-[linear-gradient(to_bottom,var(--color-night-sky)_0%,var(--color-night-sky)_55%,transparent_100%)] [mask-image:linear-gradient(to_right,transparent,black_14rem)] transition-opacity duration-1000 motion-reduce:transition-none"
          style={{
            left: `${(plan.start / grid.cols) * 100}%`,
            height: `${(Math.max(0, streetRow(grid.rows)) / grid.rows) * 100}%`,
            opacity: night ? 1 : 0,
          }}
        />
      ) : null}
      <AsciiScene
        layers={LAYERS}
        frame={frame}
        frameMs={FRAME_MS}
        staticTick={STREET_STILL_TICK}
        minRows={MIN_STREET_ROWS}
        onGridChange={onGridChange}
        data-testid="community-street"
        className="h-full font-mono text-[10px] leading-3 sm:text-xs sm:leading-[14px]"
      />
      {plan && grid && plan.lanes.length > 0 ? (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 flex"
          style={{ left: `${(plan.start / grid.cols) * 100}%` }}
        >
          {shown.map((house) => (
            <Link
              key={house.slug}
              href={`/communities/${house.slug}`}
              tabIndex={-1}
              data-testid={`street-house-${house.slug}`}
              className="flex-1"
              onPointerEnter={() => onActiveChange(house.slug)}
            />
          ))}
          {plan.lot ? (
            <div
              data-testid="street-lot"
              className="flex-1 cursor-pointer"
              onPointerEnter={() => onActiveChange(null)}
              onClick={onLotClick}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
