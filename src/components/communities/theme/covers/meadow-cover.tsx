type Role = "sky" | "cloud" | "sun" | "hillFar" | "hillMid" | "hillNear";

/** Every color comes from the look's cover palette, set on the frame. */
const paint = (role: Role) => `var(--community-cover-${role})`;

/**
 * Rolling hills under a clear sky, a small sun and a cloud. The nearest hill
 * fills everything below y=128, where the community name sits, whatever the
 * crop.
 */
export function MeadowCover() {
  return (
    <svg
      viewBox="0 0 1400 200"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
      className="absolute inset-0 size-full"
    >
      <rect width="1400" height="200" style={{ fill: paint("sky") }} />
      <circle cx="880" cy="54" r="24" style={{ fill: paint("sun") }} />
      <g style={{ fill: paint("cloud") }}>
        <ellipse cx="560" cy="58" rx="46" ry="14" />
        <circle cx="540" cy="50" r="16" />
        <circle cx="568" cy="44" r="20" />
        <ellipse cx="1180" cy="40" rx="34" ry="10" />
        <circle cx="1188" cy="33" r="13" />
      </g>
      <path
        d="M0 96 C200 70 420 80 600 92 S980 64 1180 78 S1340 90 1400 84 V200 H0 Z"
        style={{ fill: paint("hillFar") }}
      />
      <path
        d="M0 112 C240 92 460 98 700 110 S1100 88 1400 104 V200 H0 Z"
        style={{ fill: paint("hillMid") }}
      />
      <path
        d="M0 122 C300 104 620 112 880 120 S1240 108 1400 116 V200 H0 Z"
        style={{ fill: paint("hillNear") }}
      />
    </svg>
  );
}
