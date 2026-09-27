"use client";

import { useRef } from "react";
import { gridSizeFor, measureCharCell } from "@/components/ascii/measure";
import { useAsciiMotion } from "@/components/ascii/use-ascii-motion";
import {
  VIGNETTES,
  fitVignette,
  type VignetteKey,
  type VignetteLayer,
} from "./vignettes";

const FRAME_MS = 140;

/** Same token colours as the town square: quiet scenery, stronger people. */
const LAYER_CLASS: Record<VignetteLayer, string> = {
  scenery: "text-muted-foreground/70",
  people: "text-foreground/85",
};
const LAYERS: VignetteLayer[] = ["scenery", "people"];

/**
 * Decorative ASCII vignette for a "What we do" group. Motion policy comes
 * from the shared seam: still frame under reduced motion, paused off-screen
 * and in background tabs.
 */
export function AsciiVignette({
  name,
  className,
}: {
  name: VignetteKey;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<Partial<Record<VignetteLayer, HTMLPreElement>>>({});
  const vignette = VIGNETTES[name];

  useAsciiMotion(boxRef, {
    frameMs: FRAME_MS,
    staticTick: vignette.stillTick,
    measure: (el) => {
      const { cols, rows } = gridSizeFor(
        { width: el.clientWidth, height: el.clientHeight },
        measureCharCell(el),
      );
      return cols >= 10 && rows >= 4 ? { cols, rows } : null;
    },
    draw: (tick, { cols, rows }) => {
      const frame = fitVignette(vignette.frame(tick), cols, rows);
      for (const layer of LAYERS) {
        const pre = layerRefs.current[layer];
        if (pre) pre.textContent = frame[layer].join("\n");
      }
    },
  });

  return (
    <div
      ref={boxRef}
      aria-hidden="true"
      data-testid={`vignette-${name}`}
      className={`pointer-events-none relative font-mono text-[10px] leading-3 select-none sm:text-xs sm:leading-[14px] lg:text-sm lg:leading-[17px] ${className ?? ""}`}
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
  );
}
