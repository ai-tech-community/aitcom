import { useId } from "react";

type Role = "skyTop" | "skyBottom" | "rayLight" | "rayRose" | "sun" | "horizon";

/** Every color comes from the look's cover palette, set on the frame. */
const paint = (role: Role) => `var(--community-cover-${role})`;

const HORIZON = 124;
const SUN = { cx: 700, r: 52 };
const RAY_LENGTH = 1000;
const SLICES = 24;

/** Wedges fanning out from the sun over the upper half; every other slice is sky. */
const RAYS = Array.from({ length: SLICES / 2 }, (_, i) => {
  const at = (slice: number) => {
    const angle = Math.PI + (slice * Math.PI) / SLICES;
    const x = SUN.cx + RAY_LENGTH * Math.cos(angle);
    const y = HORIZON + RAY_LENGTH * Math.sin(angle);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  return {
    points: `${SUN.cx},${HORIZON} ${at(2 * i)} ${at(2 * i + 1)}`,
    role: (i % 2 === 0 ? "rayRose" : "rayLight") satisfies Role,
  };
});

/**
 * A low sun on the horizon with soft rays. The horizon band fills everything
 * below y=124, where the community name sits, whatever the crop.
 */
export function SunsetCover() {
  const sky = `cover-sunset-sky-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 1400 200"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
      className="absolute inset-0 size-full"
    >
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: paint("skyTop") }} />
          <stop offset="1" style={{ stopColor: paint("skyBottom") }} />
        </linearGradient>
      </defs>
      <rect width="1400" height={HORIZON} style={{ fill: `url(#${sky})` }} />
      {RAYS.map((ray) => (
        <polygon
          key={ray.points}
          points={ray.points}
          style={{ fill: paint(ray.role) }}
        />
      ))}
      <circle
        cx={SUN.cx}
        cy={HORIZON}
        r={SUN.r}
        style={{ fill: paint("sun") }}
      />
      <rect
        y={HORIZON}
        width="1400"
        height={200 - HORIZON}
        style={{ fill: paint("horizon") }}
      />
    </svg>
  );
}
