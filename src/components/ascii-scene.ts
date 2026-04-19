"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

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

export function useAsciiScene(
  ref: RefObject<HTMLPreElement | null>,
  renderFrame: (tick: number, cols: number, rows: number) => string,
  frameMs = 80,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let tick = 0;
    let last = 0;

    const loop = (now: number) => {
      const node = ref.current;
      if (!node) return;

      if (now - last >= frameMs) {
        last = now;

        const rect = node.getBoundingClientRect();
        const charW = 6.6;
        const charH = 13;
        const cols = Math.floor(rect.width / charW);
        const rows = Math.floor(rect.height / charH);

        if (cols >= 10 && rows >= 5) {
          node.textContent = renderFrame(tick, cols, rows);
          tick += 1;
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [frameMs, ref, renderFrame]);
}
