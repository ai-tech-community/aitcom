/** Stable IDs shared by settings validation, storage and the reading shell. */
export const MAGAZINE_FONTS = [
  "italiana",
  "bodoni",
  "cormorant",
  "geist",
] as const;
export type MagazineFont = (typeof MAGAZINE_FONTS)[number];
export const DEFAULT_MAGAZINE_FONT: MagazineFont = "italiana";

export const MAGAZINE_FONT_OPTIONS = {
  italiana: {
    label: "Italiana",
    family: "var(--font-magazine-italiana, Georgia), serif",
  },
  bodoni: {
    label: "Bodoni Moda",
    family: "var(--font-magazine-bodoni, Georgia), serif",
  },
  cormorant: {
    label: "Cormorant Garamond",
    family: "var(--font-magazine-cormorant, Georgia), serif",
  },
  geist: {
    label: "Geist Sans",
    family: "var(--font-geist-sans, Arial), sans-serif",
  },
} satisfies Record<MagazineFont, { label: string; family: string }>;

export function resolveMagazineFont(value: unknown): MagazineFont {
  return MAGAZINE_FONTS.find((font) => font === value) ?? DEFAULT_MAGAZINE_FONT;
}

/** Locale-free paths from next-intl; discovery and shelves keep site chrome. */
export function isMagazineReadingPath(pathname: string): boolean {
  return /^\/magazines\/[^/]+\/[^/]+(?:\/[^/]+)?\/?$/.test(pathname);
}
