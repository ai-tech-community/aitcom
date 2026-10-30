/**
 * A magazine's public look: one type pair from a fixed list, and one accent.
 * Missing values render as the journal pair so a magazine saved before themes
 * still looks like itself. The accent must clear WCAG AA (4.5:1) on the white
 * page or on the dark page. Text on the other surface uses a same-hue ink
 * that does clear it.
 */

export const MAGAZINE_FONT_PAIRS = [
  { id: "journal", serif: "Newsreader", sans: "Geist" },
  { id: "broadsheet", serif: "Libre Baskerville", sans: "Source Sans 3" },
  { id: "fashion", serif: "Fraunces", sans: "Outfit" },
  { id: "literary", serif: "Source Serif 4", sans: "DM Sans" },
] as const;

export type MagazineFontPairId = (typeof MAGAZINE_FONT_PAIRS)[number]["id"];

export const MAGAZINE_FONT_PAIR_IDS = MAGAZINE_FONT_PAIRS.map(
  (pair) => pair.id,
) as [MagazineFontPairId, ...MagazineFontPairId[]];

export const DEFAULT_MAGAZINE_FONT_PAIR: MagazineFontPairId = "journal";

/** Darkened signal orange. 4.5:1 on white, so the default accent is readable. */
export const DEFAULT_MAGAZINE_ACCENT = "#9A3412";

/** `oklch(1 0 0)` — the light page. */
export const MAGAZINE_LIGHT_SURFACE = "#FFFFFF";

/** `oklch(0.145 0 0)` — the dark page. */
export const MAGAZINE_DARK_SURFACE = "#1C1C1C";

const AA = 4.5;

export type MagazineTheme = {
  fontPair: MagazineFontPairId;
  accent: string;
  /** Accent text on the white page. */
  inkOnLight: string;
  /** Accent text on the dark page. */
  inkOnDark: string;
};

export function isMagazineFontPair(value: string): value is MagazineFontPairId {
  return (MAGAZINE_FONT_PAIR_IDS as readonly string[]).includes(value);
}

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

function rgbOf(hex: string): [number, number, number] {
  return [
    hexChannel(hex.slice(1, 3)),
    hexChannel(hex.slice(3, 5)),
    hexChannel(hex.slice(5, 7)),
  ];
}

function channelLuminance(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = rgbOf(hex);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function mixHex(from: string, toward: string, amount: number): string {
  const [r1, g1, b1] = rgbOf(from);
  const [r2, g2, b2] = rgbOf(toward);
  const channel = (start: number, end: number) =>
    Math.round(start + (end - start) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`.toUpperCase();
}

/** Same hue, moved toward black or white until the text clears 4.5:1. */
export function readableInk(accent: string, background: string): string {
  if (contrastRatio(accent, background) >= AA) return accent;
  const toward = relativeLuminance(background) > 0.5 ? "#000000" : "#FFFFFF";
  let low = 0;
  let high = 1;
  let best = toward;
  for (let step = 0; step < 18; step += 1) {
    const mid = (low + high) / 2;
    const mixed = mixHex(accent, toward, mid);
    if (contrastRatio(mixed, background) >= AA) {
      best = mixed;
      high = mid;
    } else {
      low = mid;
    }
  }
  return best;
}

/**
 * Null when the pair and accent can be stored. The message is for the form
 * and for an agent whose color fails the contrast check.
 */
export function magazineThemeIssue(
  fontPair: string,
  accent: string,
): string | null {
  if (!isMagazineFontPair(fontPair)) {
    return "Pick a type pair from the list.";
  }
  const hex = normalizeHexColor(accent);
  if (!hex) return "Use a hex color such as #9A3412.";
  const onLight = contrastRatio(hex, MAGAZINE_LIGHT_SURFACE);
  const onDark = contrastRatio(hex, MAGAZINE_DARK_SURFACE);
  if (onLight < AA && onDark < AA) {
    return "That accent does not have enough contrast on white or on the dark page.";
  }
  return null;
}

export function resolveMagazineTheme(
  input:
    | {
        fontPair?: string | null;
        accent?: string | null;
      }
    | null
    | undefined,
): MagazineTheme {
  const fontPair =
    input?.fontPair && isMagazineFontPair(input.fontPair)
      ? input.fontPair
      : DEFAULT_MAGAZINE_FONT_PAIR;
  const accent =
    normalizeHexColor(input?.accent ?? "") ?? DEFAULT_MAGAZINE_ACCENT;
  const stored =
    magazineThemeIssue(fontPair, accent) === null
      ? accent
      : DEFAULT_MAGAZINE_ACCENT;
  return {
    fontPair,
    accent: stored,
    inkOnLight: readableInk(stored, MAGAZINE_LIGHT_SURFACE),
    inkOnDark: readableInk(stored, MAGAZINE_DARK_SURFACE),
  };
}
