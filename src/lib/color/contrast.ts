/**
 * Color math shared by every feature that checks a color: WCAG contrast
 * (relative luminance) and an OKLCH reader for hue rules such as keeping
 * Signal Orange the only orange on screen. Colors are `#RRGGBB` strings;
 * run user input through `normalizeHexColor` first.
 */

/** Hue range (degrees) and chroma floor of the band reserved for Signal Orange. */
const ORANGE_HUE_MIN = 30;
const ORANGE_HUE_MAX = 65;
const ORANGE_CHROMA_MIN = 0.08;

/**
 * The cream band: a near-white, low-chroma, yellow-to-orange tint (cream,
 * sand, parchment, beige) that the No-Cream Rule forbids as a canvas.
 * Chroma at or below the floor is a neutral gray or white; above the ceiling
 * the color is a clear tint, not a neutral.
 */
const CREAM_LIGHTNESS_MIN = 0.85;
const CREAM_CHROMA_MIN = 0.005;
const CREAM_CHROMA_MAX = 0.08;
const CREAM_HUE_MIN = 30;
const CREAM_HUE_MAX = 100;

/** Below this chroma a color is a gray and its hue means nothing. */
const ACHROMATIC_CHROMA = 1e-4;

function hexChannel(pair: string): number {
  return Number.parseInt(pair, 16);
}

/** `#RGB` or `#RRGGBB` as `#RRGGBB`. Anything else is null. */
export function normalizeHexColor(raw: string): string | null {
  const trimmed = raw.trim();
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(trimmed);
  if (!match?.[1]) return null;
  const body = match[1];
  const full =
    body.length === 3
      ? body
          .split("")
          .map((channel) => channel + channel)
          .join("")
      : body;
  return `#${full.toUpperCase()}`;
}

/** `#RRGGBB` as its three 0–255 channels. */
export function rgbOf(hex: string): [number, number, number] {
  return [
    hexChannel(hex.slice(1, 3)),
    hexChannel(hex.slice(3, 5)),
    hexChannel(hex.slice(5, 7)),
  ];
}

/** One 0–255 sRGB channel as linear light (the sRGB transfer function). */
function linearChannel(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = rgbOf(hex);
  return (
    0.2126 * linearChannel(r) +
    0.7152 * linearChannel(g) +
    0.0722 * linearChannel(b)
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `#RRGGBB` as OKLCH (Björn Ottosson's OKLab, in polar form). `h` is in
 * degrees 0–360, and 0 for grays.
 */
export function oklchOf(hex: string): { l: number; c: number; h: number } {
  const [r, g, b] = rgbOf(hex).map(linearChannel) as [number, number, number];
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.hypot(A, B);
  const h =
    c < ACHROMATIC_CHROMA
      ? 0
      : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** True when the color would read as a second orange next to Signal Orange. */
export function isInOrangeBand(hex: string): boolean {
  const { c, h } = oklchOf(hex);
  return h >= ORANGE_HUE_MIN && h <= ORANGE_HUE_MAX && c > ORANGE_CHROMA_MIN;
}

/** True when the color is a near-white warm neutral (No-Cream Rule). */
export function isInCreamBand(hex: string): boolean {
  const { l, c, h } = oklchOf(hex);
  return (
    l >= CREAM_LIGHTNESS_MIN &&
    c > CREAM_CHROMA_MIN &&
    c <= CREAM_CHROMA_MAX &&
    h >= CREAM_HUE_MIN &&
    h <= CREAM_HUE_MAX
  );
}
