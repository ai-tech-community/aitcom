"use client";

import { useEffect, useRef } from "react";

/**
 * Spinning ASCII donut (torus) animation.
 * Based on the classic donut.c algorithm by Andy Sloane.
 */
export function AsciiDonut() {
  const preRef = useRef<HTMLPreElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const el = preRef.current;
    if (!el) return;

    let A = 0;
    let B = 0;
    const chars = ".,-~:;=!*#$@";

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

      const b: string[] = new Array(cols * rows).fill(" ");
      const z: number[] = new Array(cols * rows).fill(0);

      const R1 = 1;
      const R2 = 2;
      const K2 = 5;
      const K1 = (cols * K2 * 3) / (8 * (R1 + R2));

      for (let j = 0; j < 6.28; j += 0.07) {
        const ct = Math.cos(j);
        const st = Math.sin(j);
        for (let i = 0; i < 6.28; i += 0.02) {
          const sp = Math.sin(i);
          const cp = Math.cos(i);
          const h = ct + R2;
          const D = 1 / (sp * h * Math.sin(A) + st * Math.cos(A) + K2);
          const t = sp * h * Math.cos(A) - st * Math.sin(A);

          const x = Math.floor(cols / 2 + (K1 * D * (cp * h * Math.cos(B) - t * Math.sin(B))));
          const y = Math.floor(rows / 2 + ((K1 * D * (cp * h * Math.sin(B) + t * Math.cos(B))) * 0.5));
          const o = x + cols * y;

          const N = Math.floor(
            8 *
              ((st * Math.sin(A) - sp * ct * Math.cos(A)) * Math.cos(B) -
                sp * ct * Math.sin(A) -
                st * Math.cos(A) -
                cp * ct * Math.sin(B)),
          );

          if (y >= 0 && y < rows && x >= 0 && x < cols && D > z[o]!) {
            z[o] = D;
            b[o] = chars[Math.max(0, N)] ?? ".";
          }
        }
      }

      let output = "";
      for (let k = 0; k < cols * rows; k++) {
        output += k % cols === cols - 1 ? "\n" : b[k];
      }
      el.textContent = output;

      A += 0.04;
      B += 0.02;
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
