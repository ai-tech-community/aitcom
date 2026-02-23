"use client";

import { useEffect, useRef } from "react";

/**
 * Animated ASCII sine wave pattern — layered waves
 * creating a flowing data-stream feel.
 */
export function AsciiWave() {
  const preRef = useRef<HTMLPreElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const el = preRef.current;
    if (!el) return;

    let t = 0;
    const chars = " .:-=+*#%@";

    function render() {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const charW = 6.6;
      const charH = 13;
      const cols = Math.floor(rect.width / charW);
      const rows = Math.floor(rect.height / charH);

      if (cols < 10 || rows < 5) {
        frameRef.current = requestAnimationFrame(render);
        return;
      }

      let output = "";

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const nx = x / cols;
          const ny = y / rows;

          // Layer multiple sine waves for rich interference pattern
          const w1 = Math.sin(nx * 8 + t * 0.8) * Math.cos(ny * 4 - t * 0.3);
          const w2 = Math.sin(nx * 5 - t * 0.5 + ny * 6) * 0.5;
          const w3 = Math.cos(nx * 3 + ny * 3 + t * 0.4) * 0.3;

          const v = (w1 + w2 + w3 + 1.8) / 3.6; // Normalize to 0..1
          const idx = Math.floor(v * (chars.length - 1));
          output += chars[Math.max(0, Math.min(chars.length - 1, idx))];
        }
        if (y < rows - 1) output += "\n";
      }

      el.textContent = output;
      t += 0.03;
      frameRef.current = requestAnimationFrame(render);
    }

    render();
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <pre
      ref={preRef}
      className="text-muted-foreground/50 group-hover:text-muted-foreground/70 pointer-events-none flex h-full w-full items-center justify-center overflow-hidden font-mono text-[10px] leading-[13px] transition-colors"
      aria-hidden="true"
    />
  );
}
