/**
 * The catalog of community looks. A community stores only a look's id; every
 * color, pattern, cover palette and heading face lives here, so one test
 * (`catalog.test.ts`) checks contrast and the orange band for every look
 * before it ships. Adding a look is one entry here plus its cover art and its
 * `communities.themes.<id>` messages.
 *
 * OKLCH notes are the design intent; the hex is what renders and what the
 * tests measure.
 */

import type { CommunityTheme, CommunityThemeId } from "./types";

const PLAIN: CommunityTheme = {
  id: "plain",
  scheme: "light",
  // Today's `:root` values in globals.css, as hex.
  tokens: {
    background: "#FFFFFF", // oklch(1 0 0)
    foreground: "#0A0A0A", // oklch(0.145 0 0)
    mutedForeground: "#737373", // oklch(0.556 0 0)
    border: "#E5E5E5", // oklch(0.922 0 0)
    input: "#E5E5E5", // oklch(0.922 0 0)
  },
  canvasPattern: null,
  cover: null,
  headingFont: null,
};

/**
 * The house status colors (`:root` in globals.css) fall just under 4.5:1 on
 * a tinted canvas and on their own 10% tint over it. The tinted light looks
 * take these: the same hues, deeper. Orange band and cream band stay clear
 * (destructive keeps hue 27, below the band).
 */
const DEEP_STATUS = {
  success: "#067132", // oklch(0.48 0.13 150)
  warning: "#7D5E07", // oklch(0.5 0.1 85)
  info: "#02629C", // oklch(0.48 0.12 245)
  destructive: "#B7191C", // oklch(0.5 0.19 27)
} as const;

const CANAL_DOT = "#C9E5F3"; // oklch(0.905 0.035 230)

const CANAL_COVER_PALETTE = {
  skyTop: "#95CDE9", // oklch(0.82 0.07 230)
  skyBottom: "#BCE6F7", // oklch(0.9 0.05 225)
  water: "#6799B7", // oklch(0.66 0.07 235)
  waterLight: "#98BED2", // oklch(0.78 0.05 232): ripples
  houseBrick: "#8D4540", // oklch(0.48 0.1 25)
  houseBrickDark: "#6C3435", // oklch(0.4 0.08 20)
  houseNavy: "#2D445C", // oklch(0.38 0.05 250)
  houseSlate: "#517791", // oklch(0.55 0.06 240)
  windowInk: "#162330", // oklch(0.25 0.03 250)
  windowLight: "#F9EFC9", // oklch(0.95 0.05 95): a lit window
  namePlate: "#FFFFFF", // the white plate behind the community name
};

const CANAL: CommunityTheme = {
  id: "canal",
  scheme: "light",
  tokens: {
    background: "#E0F4FE", // oklch(0.955 0.025 230): soft water blue
    foreground: "#0E171E", // oklch(0.2 0.02 240)
    mutedForeground: "#4C5D6A", // oklch(0.47 0.03 240)
    border: "#C1D8E4", // oklch(0.87 0.03 230)
    input: "#C1D8E4",
    ...DEEP_STATUS,
  },
  // A quiet dot grid, like light on water.
  canvasPattern: {
    image: `radial-gradient(${CANAL_DOT} 1px, transparent 1.2px)`,
    size: "14px 14px",
    colors: [CANAL_DOT],
  },
  // A row of gabled canal houses on the water, under a pale sky. Roofs and
  // fronts are brick red (hue below 30) and blues, never orange.
  cover: {
    palette: CANAL_COVER_PALETTE,
    nameColor: "#0E171E",
    nameBase: CANAL_COVER_PALETTE.namePlate,
  },
  headingFont: "fraunces",
};

const MEADOW_COVER_PALETTE = {
  sky: "#BFEFF2", // oklch(0.92 0.05 200)
  cloud: "#FFFFFF",
  sun: "#F7DD7D", // oklch(0.9 0.12 95): yellow, not orange
  hillFar: "#9FCC95", // oklch(0.8 0.09 140)
  hillMid: "#7DBD7F", // oklch(0.74 0.11 145)
  hillNear: "#5DAD70", // oklch(0.68 0.12 150)
};

const MEADOW: CommunityTheme = {
  id: "meadow",
  scheme: "light",
  tokens: {
    background: "#E6F8E6", // oklch(0.96 0.03 145): light green
    foreground: "#101911", // oklch(0.2 0.02 150)
    mutedForeground: "#4F6052", // oklch(0.47 0.03 150)
    border: "#C7DBC6", // oklch(0.87 0.035 145)
    input: "#C7DBC6",
    ...DEEP_STATUS,
  },
  canvasPattern: null,
  // Rolling hills under a clear sky, a small sun and a cloud. The name sits
  // on the nearest hill.
  cover: {
    palette: MEADOW_COVER_PALETTE,
    nameColor: "#0B2010", // oklch(0.22 0.04 150)
    nameBase: MEADOW_COVER_PALETTE.hillNear,
  },
  headingFont: "nunito",
};

const SUNSET_SKY_HIGH = "#FFEBEA"; // oklch(0.956 0.022 21): rose, outside the cream band
const SUNSET_SKY_LOW = "#FEEEF8"; // oklch(0.965 0.022 340): soft pink

const SUNSET_COVER_PALETTE = {
  skyTop: "#F8D1E6", // oklch(0.9 0.05 345): pink
  skyBottom: "#FFDFD2", // oklch(0.927 0.04 43): peach, chroma under 0.08
  rayLight: "#FFE6D1", // oklch(0.94 0.04 62)
  rayRose: "#F9C5C8", // oklch(0.87 0.06 15)
  sun: "#FFEEB9", // oklch(0.95 0.07 92): pale gold
  horizon: "#DEBFDA", // oklch(0.84 0.05 330): mauve
};

const SUNSET: CommunityTheme = {
  id: "sunset",
  scheme: "light",
  tokens: {
    background: "#FFEBEE", // oklch(0.957 0.022 7): between the two sky stops
    foreground: "#1E1214", // oklch(0.2 0.02 10)
    mutedForeground: "#6A5457", // oklch(0.47 0.03 10)
    border: "#E7CDCE", // oklch(0.87 0.03 15)
    input: "#E7CDCE",
    ...DEEP_STATUS,
  },
  // The canvas is a sky: rose at the top fading to pink. Both stops sit
  // outside hue 30–100 (21 and 340), so the canvas never reads as cream or
  // beige (`isInCreamBand`).
  canvasPattern: {
    image: `linear-gradient(180deg, ${SUNSET_SKY_HIGH}, ${SUNSET_SKY_LOW})`,
    size: "100% 100%",
    colors: [SUNSET_SKY_HIGH, SUNSET_SKY_LOW],
  },
  // A low sun on the horizon with soft rays. Rays are low-chroma peach and
  // rose pink; the name sits on the horizon band.
  cover: {
    palette: SUNSET_COVER_PALETTE,
    nameColor: "#321727", // oklch(0.25 0.05 345)
    nameBase: SUNSET_COVER_PALETTE.horizon,
  },
  headingFont: "dm-serif-display",
};

// Faint on purpose: muted text must stay at 4.5:1 even over a star.
const NIGHT_STAR = "#33364D"; // oklch(0.34 0.04 278)
const NIGHT_STAR_FAINT = "#2B2E44"; // oklch(0.31 0.04 278): a fainter second layer

/** Night's cards, and its dialogs and menus. */
const NIGHT_CARD = "#131521"; // oklch(0.2 0.025 275)

/** Night's quiet fill: between the canvas and the borders. */
const NIGHT_FILL = "#292E4A"; // oklch(0.31 0.05 275)

const NIGHT_COVER_PALETTE = {
  skyTop: "#272755", // oklch(0.3 0.08 280)
  skyBottom: "#453065", // oklch(0.36 0.09 300)
  star: "#F3F5FC", // oklch(0.97 0.01 275)
  moon: "#F0E8CA", // oklch(0.93 0.04 95)
  ridge: "#0F101F", // oklch(0.18 0.03 280)
};

const NIGHT: CommunityTheme = {
  id: "night",
  scheme: "dark",
  // Starts from `.dark` (foreground, muted foreground) on an indigo canvas,
  // with dark indigo cards. Borders are opaque here: `.dark` uses white at
  // 10–15% alpha, which a test cannot measure. Quiet fills (muted,
  // secondary, accent) are indigo too, so no gray `.dark` patch shows.
  // Dialogs and sheets sit on the card color in the floating layer; menus
  // and popovers (popover) take it too, so all of them match the cards.
  // `.dark`'s destructive red is 4.1:1 on a star; this one is lighter.
  tokens: {
    background: "#181D37", // oklch(0.24 0.05 275): deep indigo
    foreground: "#FAFAFA", // oklch(0.985 0 0)
    mutedForeground: "#A1A1A1", // oklch(0.708 0 0)
    border: "#3A405D", // oklch(0.38 0.05 275)
    input: "#454B69", // oklch(0.42 0.05 275)
    card: NIGHT_CARD,
    cardForeground: "#FAFAFA",
    muted: NIGHT_FILL,
    secondary: NIGHT_FILL,
    secondaryForeground: "#FAFAFA",
    accent: NIGHT_FILL,
    accentForeground: "#FAFAFA",
    popover: NIGHT_CARD,
    popoverForeground: "#FAFAFA",
    destructive: "#FF7D7C", // oklch(0.74 0.16 22)
  },
  // Two offset layers of faint stars.
  canvasPattern: {
    image: [
      `radial-gradient(circle at 30% 40%, ${NIGHT_STAR} 0.8px, transparent 1px)`,
      `radial-gradient(circle at 70% 65%, ${NIGHT_STAR_FAINT} 0.6px, transparent 0.8px)`,
    ].join(", "),
    size: "37px 41px, 23px 19px",
    colors: [NIGHT_STAR, NIGHT_STAR_FAINT],
  },
  // An indigo-to-violet sky with stars and a crescent moon over a dark ridge.
  cover: {
    palette: NIGHT_COVER_PALETTE,
    nameColor: "#FFFFFF",
    nameBase: NIGHT_COVER_PALETTE.skyBottom,
  },
  headingFont: "space-grotesk",
};

/** Every look, in the order the Settings tiles show them. */
export const COMMUNITY_THEMES: readonly CommunityTheme[] = [
  PLAIN,
  CANAL,
  MEADOW,
  SUNSET,
  NIGHT,
];

/** For `z.enum`. */
export const COMMUNITY_THEME_IDS = COMMUNITY_THEMES.map(
  (theme) => theme.id,
) as [CommunityThemeId, ...CommunityThemeId[]];

export const DEFAULT_COMMUNITY_THEME_ID: CommunityThemeId = PLAIN.id;

const THEMES_BY_ID = new Map<string, CommunityTheme>(
  COMMUNITY_THEMES.map((theme) => [theme.id, theme]),
);

export function isCommunityThemeId(value: unknown): value is CommunityThemeId {
  return typeof value === "string" && THEMES_BY_ID.has(value);
}

/**
 * The look for a stored id. A missing id, or one the catalog no longer has,
 * is Plain, so a removed look never breaks a page.
 */
export function resolveCommunityTheme(
  id: string | null | undefined,
): CommunityTheme {
  return (id ? THEMES_BY_ID.get(id) : undefined) ?? PLAIN;
}
