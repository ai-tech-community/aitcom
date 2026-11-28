// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  isInCreamBand,
  isInOrangeBand,
  normalizeHexColor,
  oklchOf,
  rgbOf,
} from "@/lib/color/contrast";
import en from "../../../../messages/en.json";
import fr from "../../../../messages/fr.json";
import nl from "../../../../messages/nl.json";
import {
  COMMUNITY_THEME_IDS,
  COMMUNITY_THEMES,
  DEFAULT_COMMUNITY_THEME_ID,
  isCommunityThemeId,
  resolveCommunityTheme,
} from "./index";
import type { CommunityTheme, CommunityThemeTokens } from "./index";

/** `--primary` / `--ring` in `:root`: `oklch(0.705 0.213 47.604)`, clipped to sRGB. */
const SIGNAL_ORANGE = "#FF6900";
/** `--primary` / `--ring` in `.dark`: `oklch(0.646 0.222 41.116)`, clipped to sRGB. */
const SIGNAL_ORANGE_DARK = "#F54900";
/** `--card` in `:root`: `oklch(1 0 0)`. */
const LIGHT_CARD = "#FFFFFF";
/** `--card` in `.dark`: `oklch(0.205 0 0)`. */
const DARK_CARD = "#171717";

type StatusName = "success" | "warning" | "info" | "destructive";
const STATUS_NAMES: readonly StatusName[] = [
  "success",
  "warning",
  "info",
  "destructive",
];

/**
 * The status tokens in `:root` (src/styles/globals.css), clipped to sRGB.
 * Copied by hand, like Plain's tokens: a change to the house values must
 * be copied here too.
 */
const HOUSE_STATUS_LIGHT: Record<StatusName, string> = {
  success: "#0A7E3A", // oklch(0.52 0.14 150)
  warning: "#916600", // oklch(0.54 0.13 85)
  info: "#0079C4", // oklch(0.55 0.16 240)
  destructive: "#E7000B", // oklch(0.577 0.245 27.325)
};
/** The status tokens in `.dark` (src/styles/globals.css), clipped to sRGB. */
const HOUSE_STATUS_DARK: Record<StatusName, string> = {
  success: "#4AC06C", // oklch(0.72 0.16 150)
  warning: "#E7B643", // oklch(0.8 0.14 85)
  info: "#30AFF8", // oklch(0.72 0.15 240)
  destructive: "#FF6467", // oklch(0.704 0.191 22.216)
};

/**
 * House status colors below 4.5:1 on their own 10% tint over white
 * (DESIGN.md, "Known gaps"). Plain is the house look and keeps them; a
 * themed look may not. When the house values are fixed, the gap test below
 * fails and this list must shrink.
 */
const HOUSE_TINT_GAPS: Partial<Record<string, readonly StatusName[]>> = {
  plain: ["warning", "info", "destructive"],
};

/** The surfaces a look may re-declare, each with the text it carries. */
const SURFACE_PAIRS = [
  ["muted", "foreground"],
  ["secondary", "secondaryForeground"],
  ["accent", "accentForeground"],
] as const satisfies readonly (readonly [
  keyof CommunityThemeTokens,
  keyof CommunityThemeTokens,
])[];

const AA_TEXT = 4.5;
const PRIMARY_ON_CANVAS = 2.5;

function cardOf(theme: CommunityTheme): string {
  return (
    theme.tokens.card ?? (theme.scheme === "dark" ? DARK_CARD : LIGHT_CARD)
  );
}

/** The orange the frame shows: a dark look also takes `.dark`'s primary. */
function primariesOf(theme: CommunityTheme): string[] {
  return theme.scheme === "dark"
    ? [SIGNAL_ORANGE, SIGNAL_ORANGE_DARK]
    : [SIGNAL_ORANGE];
}

/**
 * A clear yellow or gold: hue past the orange band, up to where the cream
 * band ends (65–100), with chroma above both bands' 0.08. Neither band
 * catches it; DESIGN.md allows it in cover art only, never as a surface.
 */
function isClearYellow(hex: string): boolean {
  const { c, h } = oklchOf(hex);
  return h > 65 && h <= 100 && c > 0.08;
}

/** The status colors the frame shows: the look's own, else the scheme's. */
function statusOf(theme: CommunityTheme): Record<StatusName, string> {
  const house =
    theme.scheme === "dark" ? HOUSE_STATUS_DARK : HOUSE_STATUS_LIGHT;
  return Object.fromEntries(
    STATUS_NAMES.map((name) => [name, theme.tokens[name] ?? house[name]]),
  ) as Record<StatusName, string>;
}

/**
 * `bg-<status>/10`: the status color at 10% alpha, composited over `base`
 * in sRGB as the browser paints it.
 */
function tintOf(status: string, base: string): string {
  const [sr, sg, sb] = rgbOf(status);
  const [br, bg, bb] = rgbOf(base);
  const channel = (s: number, b: number) =>
    Math.round(s * 0.1 + b * 0.9)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(sr, br)}${channel(sg, bg)}${channel(sb, bb)}`.toUpperCase();
}

/** Every `#RRGGBB` written inside a CSS value. */
function hexesIn(css: string): string[] {
  return [...css.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map(([hex]) => hex);
}

function everyHexOf(theme: CommunityTheme): string[] {
  return [
    ...Object.values(theme.tokens),
    ...(theme.canvasPattern?.colors ?? []),
    ...Object.values(theme.cover?.palette ?? {}),
    ...(theme.cover ? [theme.cover.nameColor, theme.cover.nameBase] : []),
  ];
}

const plain = resolveCommunityTheme("plain");

describe.each(COMMUNITY_THEMES)("look $id", (theme) => {
  const { tokens } = theme;

  it("keeps text readable on the canvas", () => {
    expect(
      contrastRatio(tokens.foreground, tokens.background),
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      contrastRatio(tokens.mutedForeground, tokens.background),
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("keeps text readable wherever the canvas pattern paints", () => {
    for (const color of theme.canvasPattern?.colors ?? []) {
      expect(contrastRatio(tokens.foreground, color)).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
      expect(
        contrastRatio(tokens.mutedForeground, color),
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("keeps text readable on cards", () => {
    const card = cardOf(theme);
    const cardForeground = tokens.cardForeground ?? tokens.foreground;
    expect(contrastRatio(cardForeground, card)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(tokens.mutedForeground, card)).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  it("draws lines no fainter than the house lines", () => {
    const houseBorder = contrastRatio(
      plain.tokens.border,
      plain.tokens.background,
    );
    const houseInput = contrastRatio(
      plain.tokens.input,
      plain.tokens.background,
    );
    expect(
      contrastRatio(tokens.border, tokens.background),
    ).toBeGreaterThanOrEqual(houseBorder);
    expect(
      contrastRatio(tokens.input, tokens.background),
    ).toBeGreaterThanOrEqual(houseInput);
  });

  it("keeps the Signal Orange button and focus ring visible on the canvas", () => {
    for (const primary of primariesOf(theme)) {
      expect(contrastRatio(primary, tokens.background)).toBeGreaterThanOrEqual(
        PRIMARY_ON_CANVAS,
      );
    }
  });

  it("puts the community name on its cover in readable contrast", () => {
    if (!theme.cover) return;
    expect(
      contrastRatio(theme.cover.nameColor, theme.cover.nameBase),
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("takes the name's base color from the cover palette", () => {
    if (!theme.cover) return;
    expect(Object.values(theme.cover.palette)).toContain(theme.cover.nameBase);
  });

  it("keeps every surface it re-declares readable", () => {
    for (const [surface, text] of SURFACE_PAIRS) {
      const fill = tokens[surface];
      if (!fill) continue;
      const ink = tokens[text];
      expect(ink, `${theme.id}: ${surface} needs ${text}`).toBeDefined();
      expect(
        contrastRatio(ink!, fill),
        `${theme.id}: ${text} on ${surface}`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
    if (tokens.muted) {
      expect(
        contrastRatio(tokens.mutedForeground, tokens.muted),
        `${theme.id}: mutedForeground on muted`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it.each(STATUS_NAMES)(
    "keeps %s text readable on the canvas, the pattern, cards and its own tint",
    (name) => {
      const status = statusOf(theme)[name];
      const card = cardOf(theme);
      const grounds: [string, string][] = [
        ["background", tokens.background],
        ["card", card],
        ...(theme.canvasPattern?.colors ?? []).map(
          (color) => ["pattern", color] as [string, string],
        ),
      ];
      if (!HOUSE_TINT_GAPS[theme.id]?.includes(name)) {
        grounds.push(
          ["tint on background", tintOf(status, tokens.background)],
          ["tint on card", tintOf(status, card)],
        );
      }
      for (const [where, ground] of grounds) {
        expect(
          contrastRatio(status, ground),
          `${theme.id}: ${name} ${status} on ${where} ${ground}`,
        ).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );

  it("paints no second orange on the canvas, pattern, card or cover, or in any token", () => {
    const painted = [
      ...Object.values(tokens),
      ...(theme.canvasPattern?.colors ?? []),
      ...Object.values(theme.cover?.palette ?? {}),
    ];
    expect(painted.filter(isInOrangeBand)).toEqual([]);
  });

  it("paints no cream canvas, pattern, card or other token", () => {
    // The cover palette is illustration and may use warm light tones.
    const surfaces = [
      ...Object.values(tokens),
      ...(theme.canvasPattern?.colors ?? []),
    ];
    expect(surfaces.filter(isInCreamBand)).toEqual([]);
  });

  it("paints no clear yellow canvas, pattern or surface", () => {
    const surfaces = [
      tokens.background,
      ...(theme.canvasPattern?.colors ?? []),
      ...[tokens.card, tokens.muted, tokens.secondary, tokens.accent].filter(
        (color): color is string => color !== undefined,
      ),
    ];
    expect(surfaces.filter(isClearYellow)).toEqual([]);
  });

  it("lists every color its canvas pattern draws", () => {
    if (!theme.canvasPattern) return;
    for (const hex of hexesIn(theme.canvasPattern.image)) {
      expect(theme.canvasPattern.colors).toContain(hex);
    }
  });

  it("writes every color as #RRGGBB", () => {
    for (const color of everyHexOf(theme)) {
      expect(normalizeHexColor(color)).toBe(color);
    }
  });

  it("defines its own card when it is a dark look", () => {
    if (theme.scheme !== "dark") return;
    expect(tokens.card).toBeDefined();
    expect(tokens.cardForeground).toBeDefined();
  });

  it.each([
    ["en", en],
    ["fr", fr],
    ["nl", nl],
  ] as const)("has a name and a description in %s", (_locale, messages) => {
    const copy = (
      messages.communities as {
        themes?: Record<string, { name?: string; description?: string }>;
      }
    ).themes?.[theme.id];
    expect(copy?.name?.trim()).toBeTruthy();
    expect(copy?.description?.trim()).toBeTruthy();
  });
});

describe("community theme catalog", () => {
  it("lists the looks in tile order, Plain first", () => {
    expect(COMMUNITY_THEMES.map((theme) => theme.id)).toEqual([
      "plain",
      "canal",
      "meadow",
      "sunset",
      "night",
    ]);
    expect(COMMUNITY_THEMES[0]?.id).toBe("plain");
    expect(COMMUNITY_THEME_IDS).toEqual(
      COMMUNITY_THEMES.map((theme) => theme.id),
    );
  });

  it("gives every look a unique id", () => {
    expect(new Set(COMMUNITY_THEME_IDS).size).toBe(COMMUNITY_THEMES.length);
  });

  it("makes Night the only dark look", () => {
    expect(
      COMMUNITY_THEMES.filter((theme) => theme.scheme === "dark").map(
        (theme) => theme.id,
      ),
    ).toEqual(["night"]);
  });

  it("keeps Plain bare and gives every other look a cover and a heading font", () => {
    expect(plain.cover).toBeNull();
    expect(plain.headingFont).toBeNull();
    for (const theme of COMMUNITY_THEMES.filter(
      (look) => look.id !== "plain",
    )) {
      expect(theme.cover, theme.id).not.toBeNull();
      expect(theme.headingFont, theme.id).not.toBeNull();
    }
  });

  it("gives each look its own heading face", () => {
    expect(
      Object.fromEntries(
        COMMUNITY_THEMES.map((theme) => [theme.id, theme.headingFont]),
      ),
    ).toEqual({
      plain: null,
      canal: "fraunces",
      meadow: "nunito",
      sunset: "dm-serif-display",
      night: "space-grotesk",
    });
  });

  it("uses today's house tokens for Plain", () => {
    // Plain keeps every house value, status colors included (HOUSE_STATUS_*).
    expect(plain.scheme).toBe("light");
    expect(plain.canvasPattern).toBeNull();
    expect(plain.tokens).toEqual({
      background: "#FFFFFF",
      foreground: "#0A0A0A",
      mutedForeground: "#737373",
      border: "#E5E5E5",
      input: "#E5E5E5",
    });
  });

  it("still has the house tint gaps it exempts Plain from", () => {
    // Fixing the house status colors makes these pass: drop them from
    // HOUSE_TINT_GAPS, so Plain is held to 4.5:1 on its tints as well.
    for (const [id, names] of Object.entries(HOUSE_TINT_GAPS)) {
      const theme = resolveCommunityTheme(id);
      for (const name of names ?? []) {
        const status = statusOf(theme)[name];
        expect(
          contrastRatio(status, tintOf(status, theme.tokens.background)),
          `${id}: ${name}`,
        ).toBeLessThan(AA_TEXT);
      }
    }
  });

  it("defaults to Plain", () => {
    expect(DEFAULT_COMMUNITY_THEME_ID).toBe("plain");
  });

  it("resolves a missing or unknown id to Plain", () => {
    expect(resolveCommunityTheme(null).id).toBe("plain");
    expect(resolveCommunityTheme(undefined).id).toBe("plain");
    expect(resolveCommunityTheme("").id).toBe("plain");
    expect(resolveCommunityTheme("gone").id).toBe("plain");
  });

  it("resolves a known id to its look", () => {
    expect(resolveCommunityTheme("canal").id).toBe("canal");
    expect(resolveCommunityTheme("night").id).toBe("night");
  });

  it("recognises only catalog ids", () => {
    expect(isCommunityThemeId("meadow")).toBe(true);
    expect(isCommunityThemeId("gone")).toBe(false);
    expect(isCommunityThemeId("toString")).toBe(false);
    expect(isCommunityThemeId(null)).toBe(false);
    expect(isCommunityThemeId(3)).toBe(false);
  });
});
