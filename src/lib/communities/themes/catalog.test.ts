// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  isInOrangeBand,
  normalizeHexColor,
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
import type { CommunityTheme } from "./index";

/** `--primary` / `--ring` in `:root`: `oklch(0.705 0.213 47.604)`, clipped to sRGB. */
const SIGNAL_ORANGE = "#FF6900";
/** `--primary` / `--ring` in `.dark`: `oklch(0.646 0.222 41.116)`, clipped to sRGB. */
const SIGNAL_ORANGE_DARK = "#F54900";
/** `--card` in `:root`: `oklch(1 0 0)`. */
const LIGHT_CARD = "#FFFFFF";
/** `--card` in `.dark`: `oklch(0.205 0 0)`. */
const DARK_CARD = "#171717";

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

  it("paints no second orange on the canvas, pattern or cover", () => {
    const painted = [
      tokens.background,
      ...(theme.canvasPattern?.colors ?? []),
      ...Object.values(theme.cover?.palette ?? {}),
    ];
    expect(painted.filter(isInOrangeBand)).toEqual([]);
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
