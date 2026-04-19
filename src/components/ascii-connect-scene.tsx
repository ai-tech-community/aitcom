"use client";

import { useCallback, useRef } from "react";
import { fitAsciiFrame, useAsciiScene } from "@/components/ascii-scene";

const ROUTES = ["A->B->D", "A->C->E", "B->E->F", "C->D->F"];

function connectLines(route: string, pulse: boolean, hop: number): string[] {
  const dot = pulse ? "o" : "*";
  const marker = pulse ? "@" : "+";

  return [
    "/-------------------- community mesh ------------------------\\",
    "| [A]------[B]------[D]                                      |",
    "|  |  \\      |  \\     |                                     |",
    "|  |   \\     |   \\    |                                     |",
    "| [C]------[E]------[F]                                      |",
    "|                                                            |",
    "|  messages in flight:                                       |",
    `|  ${hop % 3 === 0 ? marker : dot} A -> B   ${hop % 3 === 1 ? marker : dot} B -> D   ${hop % 3 === 2 ? marker : dot} D -> F`.padEnd(
      61,
      " ",
    ) + "|",
    `|  active route: ${route}`.padEnd(61, " ") + "|",
    `|  community signal: ${pulse ? "synchronized" : "propagating"}`.padEnd(
      61,
      " ",
    ) + "|",
    "\\------------------------------------------------------------/",
  ];
}

export function AsciiConnectScene() {
  const preRef = useRef<HTMLPreElement>(null);

  const render = useCallback((tick: number, cols: number, rows: number) => {
    const route = ROUTES[Math.floor(tick / 10) % ROUTES.length] ?? ROUTES[0]!;
    const pulse = Math.floor(tick / 2) % 2 === 0;
    const hop = tick % 3;
    return fitAsciiFrame(connectLines(route, pulse, hop), cols, rows);
  }, []);

  useAsciiScene(preRef, render, 90);

  return (
    <pre
      ref={preRef}
      className="text-muted-foreground/50 group-hover:text-muted-foreground/70 pointer-events-none flex h-full w-full items-center justify-center overflow-hidden font-mono text-[10px] leading-[13px] transition-colors"
      aria-hidden="true"
    />
  );
}
