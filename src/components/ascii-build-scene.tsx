"use client";

import { useCallback, useRef } from "react";
import { fitAsciiFrame, useAsciiScene } from "@/components/ascii-scene";

function buildLines(phase: number, blink: boolean) {
  const cursor = blink ? "_" : " ";
  const fileA = phase >= 1 ? "[ok] src/agent/core.ts" : "[..] src/agent/core.ts";
  const fileB = phase >= 2 ? "[ok] src/agent/tools.ts" : "[..] src/agent/tools.ts";
  const fileC = phase >= 2 ? "[ok] src/agent/prompts.ts" : "[..] src/agent/prompts.ts";
  const status =
    phase >= 3
      ? "BUILD STATUS: PASS (3 modules, 0 errors)"
      : phase === 2
        ? "BUILD STATUS: compiling..."
        : "BUILD STATUS: waiting...";

  return [
    "/---------------------- build terminal ----------------------\\",
    "| user@ait:~/project $ npx create-agent my-bot            |",
    "| scaffold: initializing workspace...                      |",
    "|                                                           |",
    `| ${fileA.padEnd(57, " ")}|`,
    `| ${fileB.padEnd(57, " ")}|`,
    `| ${fileC.padEnd(57, " ")}|`,
    "|                                                           |",
    `| ${status.padEnd(57, " ")}|`,
    "|                                                           |",
    "| user@ait:~/project $ pnpm build                          |",
    `| > ${phase >= 3 ? "done" : "running"} ${cursor}`.padEnd(60, " ") + "|",
    "\\-----------------------------------------------------------/",
  ];
}

export function AsciiBuildScene() {
  const preRef = useRef<HTMLPreElement>(null);

  const render = useCallback((tick: number, cols: number, rows: number) => {
    const phase = Math.floor(tick / 10) % 4;
    const blink = Math.floor(tick / 4) % 2 === 0;
    return fitAsciiFrame(buildLines(phase, blink), cols, rows);
  }, []);

  useAsciiScene(preRef, render, 75);

  return (
    <pre
      ref={preRef}
      className="text-muted-foreground/50 group-hover:text-muted-foreground/70 pointer-events-none flex h-full w-full items-center justify-center overflow-hidden font-mono text-[10px] leading-[13px] transition-colors"
      aria-hidden="true"
    />
  );
}
