"use client";

import { useCallback, useRef } from "react";
import { fitAsciiFrame, useAsciiScene } from "@/components/ascii-scene";

type Team = {
  name: string;
  score: number;
};

const ROUNDS: Team[][] = [
  [
    { name: "ALPHA", score: 62 },
    { name: "BETA ", score: 58 },
    { name: "GAMMA", score: 47 },
  ],
  [
    { name: "BETA ", score: 66 },
    { name: "ALPHA", score: 64 },
    { name: "GAMMA", score: 55 },
  ],
  [
    { name: "ALPHA", score: 72 },
    { name: "GAMMA", score: 69 },
    { name: "BETA ", score: 65 },
  ],
  [
    { name: "GAMMA", score: 78 },
    { name: "ALPHA", score: 76 },
    { name: "BETA ", score: 73 },
  ],
];

function bar(score: number, blink: boolean): string {
  const units = Math.max(1, Math.floor(score / 4));
  const fill = blink ? "#" : "=";
  return `${fill.repeat(units)}${".".repeat(Math.max(0, 24 - units))}`;
}

function competeLines(round: Team[], blink: boolean, roundNo: number): string[] {
  return [
    "/---------------- challenge leaderboard ---------------------\\",
    `| ROUND ${String(roundNo + 1).padStart(2, "0")}  | live updates | rewards | badges                 |`,
    "|------------------------------------------------------------|",
    `| 1) ${round[0]!.name}  ${String(round[0]!.score).padStart(3, " ")} pts  [${bar(round[0]!.score, blink)}] |`,
    `| 2) ${round[1]!.name}  ${String(round[1]!.score).padStart(3, " ")} pts  [${bar(round[1]!.score, blink)}] |`,
    `| 3) ${round[2]!.name}  ${String(round[2]!.score).padStart(3, " ")} pts  [${bar(round[2]!.score, blink)}] |`,
    "|                                                            |",
    "| TASK: optimize retrieval pipeline under 150ms latency      |",
    `| STATUS: ${blink ? "score event incoming *" : "running validations..."}`.padEnd(61, " ") + "|",
    "\\------------------------------------------------------------/",
  ];
}

export function AsciiCompeteScene() {
  const preRef = useRef<HTMLPreElement>(null);

  const render = useCallback((tick: number, cols: number, rows: number) => {
    const roundNo = Math.floor(tick / 10) % ROUNDS.length;
    const blink = Math.floor(tick / 3) % 2 === 0;
    return fitAsciiFrame(competeLines(ROUNDS[roundNo]!, blink, roundNo), cols, rows);
  }, []);

  useAsciiScene(preRef, render, 85);

  return (
    <pre
      ref={preRef}
      className="text-muted-foreground/50 group-hover:text-muted-foreground/70 pointer-events-none flex h-full w-full items-center justify-center overflow-hidden font-mono text-[10px] leading-[13px] transition-colors"
      aria-hidden="true"
    />
  );
}
