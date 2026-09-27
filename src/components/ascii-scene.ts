"use client";

import type { RefObject } from "react";
import { gridSizeFor, measureCharCell } from "@/components/ascii/measure";
import { useAsciiMotion } from "@/components/ascii/use-ascii-motion";

export function fitAsciiFrame(
  lines: string[],
  cols: number,
  rows: number,
): string {
  if (cols < 2 || rows < 2) return "";

  const safeLines = lines.length ? lines : [""];
  const width = safeLines.reduce((max, line) => Math.max(max, line.length), 0);

  const clampedRows = Math.max(1, rows);
  const clampedCols = Math.max(1, cols);

  const topPad = Math.max(0, Math.floor((clampedRows - safeLines.length) / 2));
  const leftPad = Math.max(0, Math.floor((clampedCols - width) / 2));

  const out: string[] = [];

  for (let y = 0; y < clampedRows; y++) {
    const sourceIdx = y - topPad;
    const source =
      sourceIdx >= 0 && sourceIdx < safeLines.length
        ? (safeLines[sourceIdx] ?? "")
        : "";

    const cropped =
      source.length > clampedCols ? source.slice(0, clampedCols) : source;
    const paddedLeft = " ".repeat(leftPad) + cropped;
    out.push(paddedLeft.padEnd(clampedCols, " "));
  }

  return out.join("\n");
}

/**
 * Animate a text-only ASCII scene into a `<pre>`. Colour comes from the
 * element's CSS (currentColor), so no style is read per frame. Motion policy
 * (reduced motion, off-screen, hidden tab) lives in `useAsciiMotion`.
 */
export function useAsciiScene(
  ref: RefObject<HTMLPreElement | null>,
  renderFrame: (tick: number, cols: number, rows: number) => string,
  frameMs = 80,
  staticTick = 0,
) {
  useAsciiMotion(ref, {
    frameMs,
    staticTick,
    measure: (el) => {
      const { cols, rows } = gridSizeFor(
        { width: el.clientWidth, height: el.clientHeight },
        measureCharCell(el),
      );
      return cols >= 10 && rows >= 5 ? { cols, rows } : null;
    },
    draw: (tick, { cols, rows }) => {
      const node = ref.current;
      if (node) node.textContent = renderFrame(tick, cols, rows);
    },
  });
}
