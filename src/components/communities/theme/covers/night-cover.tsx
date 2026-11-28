import { CoverSvg, coverPaint, useCoverId } from "./cover-svg";

type Role = "skyTop" | "skyBottom" | "star" | "moon" | "ridge";

const paint: (role: Role) => string = coverPaint;

/**
 * Stars in the upper sky only (y < 112), clear of the community name. A
 * fixed seed, so the server and the browser draw the same sky.
 */
const STARS = (() => {
  let seed = 7;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: 48 }, () => ({
    cx: Math.round(next() * 1400),
    cy: Math.round(6 + next() * 104),
    r: next() < 0.2 ? 1.8 : 1,
  }));
})();

const MOON = { cx: 900, cy: 50, r: 24 };

/** A crescent: the moon's left half-disc less a narrower half-ellipse. */
const CRESCENT = [
  `M${MOON.cx} ${MOON.cy - MOON.r}`,
  `A${MOON.r} ${MOON.r} 0 0 0 ${MOON.cx} ${MOON.cy + MOON.r}`,
  `A${MOON.r * 0.55} ${MOON.r} 0 0 1 ${MOON.cx} ${MOON.cy - MOON.r}`,
  "Z",
].join(" ");

/**
 * An indigo-to-violet sky with stars and a crescent moon over a dark ridge.
 * The sky is plain skyBottom below y=120 on the left, where the community
 * name sits; the ridge rises on the right.
 */
export function NightCover() {
  const sky = useCoverId("night-sky");
  return (
    <CoverSvg>
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: paint("skyTop") }} />
          <stop offset="0.6" style={{ stopColor: paint("skyBottom") }} />
        </linearGradient>
      </defs>
      <rect width="1400" height="200" style={{ fill: `url(#${sky})` }} />
      <g style={{ fill: paint("star") }}>
        {STARS.map((star) => (
          <circle
            key={`${star.cx},${star.cy}`}
            cx={star.cx}
            cy={star.cy}
            r={star.r}
          />
        ))}
      </g>
      <path d={CRESCENT} style={{ fill: paint("moon") }} />
      <path
        d="M760 200 C880 190 960 150 1060 146 S1220 128 1300 140 S1380 150 1400 146 V200 Z"
        style={{ fill: paint("ridge") }}
      />
    </CoverSvg>
  );
}
