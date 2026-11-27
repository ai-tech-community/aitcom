"use client";

import type { CSSProperties, ReactNode } from "react";

import {
  resolveCommunityTheme,
  type CommunityTheme,
  type CommunityThemeId,
  type CommunityThemeTokens,
} from "@/lib/communities/themes";
import { cn } from "@/lib/utils";

import { coverPaletteProperties } from "./community-cover-art";
import { useShownCommunityThemeId } from "./community-theme-preview";
import { headingFontClass, headingFontProperties } from "./heading-fonts";

/**
 * The site token each look token re-declares. A token the look leaves out
 * is not set, so the frame keeps the scheme's value (`:root` or `.dark`).
 */
const TOKEN_PROPERTIES: Record<keyof CommunityThemeTokens, string> = {
  background: "--background",
  foreground: "--foreground",
  mutedForeground: "--muted-foreground",
  border: "--border",
  input: "--input",
  card: "--card",
  cardForeground: "--card-foreground",
  muted: "--muted",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  success: "--success",
  warning: "--warning",
  info: "--info",
  destructive: "--destructive",
};

/**
 * The look as custom properties on the frame (token scoping): the site's own
 * tokens re-declared, so every component inside follows without knowing
 * themes exist; the canvas pattern, which `[data-community-theme]` in
 * globals.css paints; the heading face's needs; and the cover palette, for
 * art drawn straight in the frame (`CommunityCoverArt` carries its own).
 * `color-scheme` follows the look, so scrollbars and form controls the
 * browser draws match the canvas.
 */
function themeProperties(theme: CommunityTheme): CSSProperties {
  const { tokens, canvasPattern, cover } = theme;
  const properties: Record<string, string> = {
    colorScheme: theme.scheme,
  };
  for (const [token, property] of Object.entries(TOKEN_PROPERTIES)) {
    const value = tokens[token as keyof CommunityThemeTokens];
    if (value) properties[property] = value;
  }
  if (canvasPattern) {
    properties["--community-canvas-image"] = canvasPattern.image;
    properties["--community-canvas-size"] = canvasPattern.size;
  }
  return {
    ...properties,
    ...headingFontProperties(theme.headingFont),
    ...coverPaletteProperties(cover),
  } as CSSProperties;
}

/**
 * The community frame in its look: the saved one, or the one being
 * previewed. A dark look takes the site's `.dark` tokens first. Signal
 * Orange (`--primary`) is never re-declared. Do not nest scopes: a light
 * look inside a dark one would inherit its dark tokens.
 */
export function CommunityThemeScope({
  themeId,
  className,
  children,
}: {
  themeId: CommunityThemeId;
  className?: string;
  children: ReactNode;
}) {
  const theme = resolveCommunityTheme(useShownCommunityThemeId(themeId));
  return (
    <div
      data-community-theme={theme.id}
      className={cn(
        theme.scheme === "dark" && "dark",
        "bg-background text-foreground",
        headingFontClass(theme.headingFont),
        className,
      )}
      style={themeProperties(theme)}
    >
      {children}
    </div>
  );
}
