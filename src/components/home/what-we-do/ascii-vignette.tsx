"use client";

import { useCallback } from "react";
import {
  AsciiScene,
  type AsciiSceneLayer,
} from "@/components/ascii/ascii-scene";
import {
  VIGNETTES,
  fitVignette,
  type VignetteKey,
  type VignetteLayer,
} from "./vignettes";

const FRAME_MS = 140;

/** Same token colours as the town square: quiet scenery, stronger people. */
const LAYERS: readonly AsciiSceneLayer<VignetteLayer>[] = [
  { name: "scenery", className: "text-muted-foreground/70" },
  { name: "people", className: "text-foreground/85" },
];

/** Decorative ASCII vignette for a "What we do" group. */
export function AsciiVignette({
  name,
  className,
}: {
  name: VignetteKey;
  className?: string;
}) {
  const vignette = VIGNETTES[name];
  const frame = useCallback(
    (tick: number, cols: number, rows: number) =>
      fitVignette(vignette.frame(tick), cols, rows),
    [vignette],
  );

  return (
    <AsciiScene
      layers={LAYERS}
      frame={frame}
      frameMs={FRAME_MS}
      staticTick={vignette.stillTick}
      data-testid={`vignette-${name}`}
      className={`font-mono text-[10px] leading-3 sm:text-xs sm:leading-[14px] lg:text-sm lg:leading-[17px] ${className ?? ""}`}
    />
  );
}
