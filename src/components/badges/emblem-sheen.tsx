"use client";

import { useId } from "react";

/**
 * The limited-edition sheen: off the emblem at rest, sweeping across on
 * hover. Under reduced motion it never moves; it rests across the emblem
 * as a static highlight instead.
 */
export const SHEEN_CLASS =
  "-translate-x-[70px] motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-out motion-safe:group-hover/emblem:translate-x-[110px] motion-reduce:translate-x-[30px]";

/**
 * The only client part of `BadgeEmblem`: the clip and gradient need ids
 * unique on the page, so it uses `useId`.
 */
export function EmblemSheen({ d }: { d: string }) {
  // useId() contains characters that break url(#…) references.
  const id = `emblem-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const clip = `${id}-clip`;
  const fill = `${id}-sheen`;
  return (
    <>
      <defs>
        <clipPath id={clip}>
          <path d={d} />
        </clipPath>
        <linearGradient id={fill} x1="0" x2="1" y1="0" y2="0">
          <stop
            offset="0"
            style={{ stopColor: "var(--emblem-sheen)" }}
            stopOpacity={0}
          />
          <stop offset="0.5" style={{ stopColor: "var(--emblem-sheen)" }} />
          <stop
            offset="1"
            style={{ stopColor: "var(--emblem-sheen)" }}
            stopOpacity={0}
          />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <g transform="rotate(20 50 50)">
          <rect
            x={10}
            y={-20}
            width={36}
            height={140}
            fill={`url(#${fill})`}
            data-emblem-part="sheen"
            className={SHEEN_CLASS}
          />
        </g>
      </g>
    </>
  );
}
