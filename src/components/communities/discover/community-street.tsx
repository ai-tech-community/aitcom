"use client";

import { useCallback, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  AsciiScene,
  type AsciiSceneLayer,
} from "@/components/ascii/ascii-scene";
import type { GridSize } from "@/components/ascii/measure";
import {
  MIN_STREET_ROWS,
  STREET_STILL_TICK,
  communityStreetFrame,
  streetCapacity,
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
 * The street of community houses. Decorative (aria-hidden): the list
 * beside it carries every fact as text and is the keyboard path. With a
 * mouse, pointing at a house marks it (and its list row) and clicking it
 * opens the community — one invisible hit area per house, laid over the
 * art in the same equal lanes the scene draws.
 */
export function CommunityStreet({
  houses,
  activeSlug,
  onActiveChange,
  className,
}: {
  houses: readonly StreetHouse[];
  activeSlug: string | null;
  onActiveChange: (slug: string | null) => void;
  className?: string;
}) {
  const router = useRouter();
  const [grid, setGrid] = useState<GridSize | null>(null);
  const onGridChange = useCallback(
    (next: GridSize | null) =>
      setGrid((prev) => (sameGrid(prev, next) ? prev : next)),
    [],
  );
  const frame = useCallback(
    (tick: number, cols: number, rows: number) =>
      communityStreetFrame(houses, cols, rows, tick, activeSlug),
    [houses, activeSlug],
  );
  const shown = grid ? houses.slice(0, streetCapacity(grid.cols, houses.length)) : [];

  return (
    <div className={cn("relative", className)}>
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
      {shown.length > 0 ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 hidden sm:flex"
          onPointerLeave={() => onActiveChange(null)}
        >
          {shown.map((house) => (
            <div
              key={house.slug}
              data-testid={`street-house-${house.slug}`}
              className="flex-1 cursor-pointer"
              onPointerEnter={() => onActiveChange(house.slug)}
              onClick={() => router.push(`/communities/${house.slug}`)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
