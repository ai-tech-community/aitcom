import {
  COVER_HEIGHT,
  COVER_WIDTH,
  CoverSvg,
  coverPaint,
  useCoverId,
} from "./cover-svg";

type Role =
  | "skyTop"
  | "skyBottom"
  | "water"
  | "waterLight"
  | "houseBrick"
  | "houseBrickDark"
  | "houseNavy"
  | "houseSlate"
  | "windowInk"
  | "windowLight";

const paint: (role: Role) => string = coverPaint;

const WIDTH = COVER_WIDTH;
const WATERLINE = 166;

type House = {
  x: number;
  width: number;
  /** Wall height, from the waterline to where the gable starts. */
  wall: number;
  front: Role;
  gable: "pointed" | "stepped";
};

const WIDTHS = [74, 62, 80, 58, 70, 66, 84, 60];
const WALLS = [92, 112, 84, 120, 100, 88, 108, 96];
const FRONTS: Role[] = [
  "houseBrick",
  "houseNavy",
  "houseBrickDark",
  "houseSlate",
  "houseBrick",
  "houseSlate",
  "houseNavy",
  "houseBrickDark",
];

const HOUSES: House[] = [];
for (let i = 0, x = 0; x < WIDTH; i++) {
  const width = WIDTHS[i % WIDTHS.length]!;
  HOUSES.push({
    x,
    width,
    wall: WALLS[(i * 3) % WALLS.length]!,
    front: FRONTS[i % FRONTS.length]!,
    gable: i % 3 === 1 ? "stepped" : "pointed",
  });
  x += width;
}

function outline({ x, width, wall, gable }: House): string {
  const top = WATERLINE - wall;
  const right = x + width;
  const points: [number, number][] = [[x, WATERLINE]];
  if (gable === "pointed") {
    points.push([x, top], [x + width / 2, top - width * 0.42], [right, top]);
  } else {
    const run = width / 7;
    const rise = 10;
    points.push(
      [x, top],
      [x, top - rise],
      [x + run, top - rise],
      [x + run, top - 2 * rise],
      [x + 2 * run, top - 2 * rise],
      [x + 2 * run, top - 3 * rise],
      [right - 2 * run, top - 3 * rise],
      [right - 2 * run, top - 2 * rise],
      [right - run, top - 2 * rise],
      [right - run, top - rise],
      [right, top - rise],
      [right, top],
    );
  }
  points.push([right, WATERLINE]);
  return points.map(([px, py]) => `${px},${py}`).join(" ");
}

type Window = { x: number; y: number; lit: boolean };

function windows({ x, width, wall }: House, house: number): Window[] {
  const result: Window[] = [];
  const columns = [x + width * 0.22, x + width * 0.78 - 12];
  for (let floor = 0, y = WATERLINE - wall + 10; y + 14 <= 156; floor++) {
    for (const [column, wx] of columns.entries()) {
      result.push({ x: wx, y, lit: (house * 3 + floor + column) % 7 === 2 });
    }
    y += 24;
  }
  return result;
}

const RIPPLES = [
  [40, 176, 70],
  [210, 186, 46],
  [360, 178, 88],
  [560, 190, 54],
  [700, 177, 64],
  [880, 187, 80],
  [1060, 179, 50],
  [1220, 189, 72],
] as const;

/** A row of gabled canal houses on the water, under a pale sky. */
export function CanalCover() {
  const sky = useCoverId("canal-sky");
  return (
    <CoverSvg>
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: paint("skyTop") }} />
          <stop offset="1" style={{ stopColor: paint("skyBottom") }} />
        </linearGradient>
      </defs>
      <rect width={WIDTH} height={WATERLINE} style={{ fill: `url(#${sky})` }} />
      {HOUSES.map((house, index) => (
        <g key={house.x}>
          <polygon
            points={outline(house)}
            style={{ fill: paint(house.front) }}
          />
          {windows(house, index).map((w) => (
            <rect
              key={`${w.x},${w.y}`}
              x={w.x}
              y={w.y}
              width={12}
              height={14}
              rx={2}
              style={{ fill: paint(w.lit ? "windowLight" : "windowInk") }}
            />
          ))}
        </g>
      ))}
      <rect
        y={WATERLINE}
        width={WIDTH}
        height={COVER_HEIGHT - WATERLINE}
        style={{ fill: paint("water") }}
      />
      {RIPPLES.map(([x, y, width]) => (
        <rect
          key={x}
          x={x}
          y={y}
          width={width}
          height={2}
          rx={1}
          style={{ fill: paint("waterLight") }}
        />
      ))}
    </CoverSvg>
  );
}
