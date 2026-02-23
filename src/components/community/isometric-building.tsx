import React from "react";

type IsometricBuildingProps = {
  size?: number;
  height?: number;
  accent?: string;
  windows?: number;
};

export function IsometricBuilding({
  size = 60,
  height = 80,
  accent = "#f97316",
  windows = 2,
}: IsometricBuildingProps) {
  const w = size;
  const h = height;

  const topFace = "#52525b";
  const leftFace = "#27272a";
  const rightFace = "#18181b";

  const vbW = w * 2;
  const vbH = w + h;

  const topPts = `${w},0 ${w * 2},${w * 0.5} ${w},${w} 0,${w * 0.5}`;
  const leftPts = `0,${w * 0.5} ${w},${w} ${w},${w + h} 0,${w * 0.5 + h}`;
  const rightPts = `${w},${w} ${w * 2},${w * 0.5} ${w * 2},${w * 0.5 + h} ${w},${w + h}`;

  const windowEls: React.ReactNode[] = [];
  if (windows > 0) {
    const rowH = h / (windows + 1);
    for (let row = 1; row <= windows; row++) {
      const y0 = w + row * rowH - 4;
      for (const col of [0.32, 0.65]) {
        const wx = w + col * w;
        windowEls.push(
          <rect
            key={`w-${row}-${col}`}
            x={wx}
            y={y0}
            width={5}
            height={6}
            fill={accent}
            opacity={0.7}
            rx={0.5}
          />,
        );
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      width={vbW}
      height={vbH}
      style={{ display: "block", overflow: "visible" }}
      aria-hidden="true"
    >
      <polygon points={rightPts} fill={rightFace} />
      <polygon points={leftPts} fill={leftFace} />
      <polygon points={topPts} fill={topFace} />
      <polygon points={topPts} fill="none" stroke="#000" strokeWidth={0.5} opacity={0.4} />
      <polygon points={leftPts} fill="none" stroke="#000" strokeWidth={0.5} opacity={0.4} />
      <polygon points={rightPts} fill="none" stroke="#000" strokeWidth={0.5} opacity={0.4} />
      {windowEls}
    </svg>
  );
}
