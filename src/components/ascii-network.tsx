"use client";

import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Animated ASCII network — floating nodes connected by lines,
 * representing community connections.
 */
export function AsciiNetwork() {
  const preRef = useRef<HTMLPreElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const el = preRef.current;
    if (!el) return;

    const nodeCount = 12;
    const nodes: Node[] = [];
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.002,
        vy: (Math.random() - 0.5) * 0.002,
      });
    }

    const connectionChars = "·-=~:";

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

      // Move nodes
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < 0.05 || node.x > 0.95) node.vx *= -1;
        if (node.y < 0.05 || node.y > 0.95) node.vy *= -1;
        node.x = Math.max(0.02, Math.min(0.98, node.x));
        node.y = Math.max(0.02, Math.min(0.98, node.y));
      }

      // Initialize grid
      const grid: string[][] = [];
      for (let y = 0; y < rows; y++) {
        grid.push(new Array(cols).fill(" "));
      }

      // Draw connections between nearby nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]!;
          const b = nodes[j]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 0.4) {
            // Bresenham-style line between the two nodes
            const steps = Math.floor(dist * Math.max(cols, rows));
            const charIdx = Math.floor((1 - dist / 0.4) * (connectionChars.length - 1));
            const ch = connectionChars[charIdx] ?? "·";

            for (let s = 0; s <= steps; s++) {
              const t = s / Math.max(1, steps);
              const px = Math.floor((a.x + dx * t) * (cols - 1));
              const py = Math.floor((a.y + dy * t) * (rows - 1));
              if (py >= 0 && py < rows && px >= 0 && px < cols) {
                grid[py]![px] = ch;
              }
            }
          }
        }
      }

      // Draw nodes themselves
      for (const node of nodes) {
        const nx = Math.floor(node.x * (cols - 1));
        const ny = Math.floor(node.y * (rows - 1));
        if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
          grid[ny]![nx] = "@";
          // Small glow around node
          if (nx > 0) grid[ny]![nx - 1] = grid[ny]![nx - 1] === " " ? "·" : grid[ny]![nx - 1]!;
          if (nx < cols - 1) grid[ny]![nx + 1] = grid[ny]![nx + 1] === " " ? "·" : grid[ny]![nx + 1]!;
        }
      }

      el.textContent = grid.map((row) => row.join("")).join("\n");
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
