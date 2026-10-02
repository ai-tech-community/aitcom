/**
 * Emblem colours as literal sRGB, for renderers that have no CSS custom
 * properties or OKLCH (the Open Graph image renderer). In the browser the
 * emblem reads the `--emblem-*` tokens from globals.css instead; the
 * values here mirror them, and a test keeps the two in step.
 */
import type { EmblemStyle } from "./emblem-shapes";

/** The `--emblem-hue-*` tokens: bare OKLCH hue angles. */
export const EMBLEM_HUES: Readonly<Record<string, number>> = {
  "--emblem-hue-award": 85,
  "--emblem-hue-teacher": 108,
  "--emblem-hue-learner": 131,
  "--emblem-hue-builder": 154,
  "--emblem-hue-benchmarker": 177,
  "--emblem-hue-writer": 200,
  "--emblem-hue-regular": 223,
  "--emblem-hue-agent-wrangler": 269,
  "--emblem-hue-host": 292,
  "--emblem-hue-limited": 315,
  "--emblem-hue-challenger": 338,
  "--emblem-hue-streak": 1,
  "--emblem-hue-connector": 246,
};

interface Tone {
  l: number;
  c: number;
}

/** `--emblem-ink-*` and `--emblem-tint-*` per theme. */
export const EMBLEM_TONES: Readonly<
  Record<"light" | "dark", { ink: Tone; tint: Tone }>
> = {
  light: { ink: { l: 0.45, c: 0.075 }, tint: { l: 0.96, c: 0.02 } },
  dark: { ink: { l: 0.84, c: 0.07 }, tint: { l: 0.27, c: 0.03 } },
};

/** Literal colours for `BadgeEmblem`'s `palette` prop. */
export interface EmblemPalette {
  /** Rings, band and glyph. */
  ink: string;
  /** The body. */
  tint: string;
}

function toSrgbChannel(linear: number): number {
  const v =
    linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

/** An OKLCH colour as `#rrggbb` (gamut-clipped per channel). */
export function oklchToHex(l: number, c: number, hueDeg: number): string {
  const h = (hueDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return `#${rgb
    .map((channel) => toSrgbChannel(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** The emblem's colours in a theme, as `#rrggbb`. Neutral without a hue. */
export function emblemPalette(
  style: EmblemStyle,
  theme: "light" | "dark",
): EmblemPalette {
  const tones = EMBLEM_TONES[theme];
  const hue = style.hue ? EMBLEM_HUES[style.hue] : undefined;
  const colour = (tone: Tone) =>
    hue === undefined
      ? oklchToHex(tone.l, 0, 0)
      : oklchToHex(tone.l, tone.c, hue);
  return { ink: colour(tones.ink), tint: colour(tones.tint) };
}
