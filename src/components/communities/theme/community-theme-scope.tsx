"use client";

import type { CSSProperties, ReactNode } from "react";

import {
  resolveCommunityTheme,
  type CommunityTheme,
  type CommunityThemeId,
} from "@/lib/communities/themes";
import { cn } from "@/lib/utils";

import { coverPaletteProperties } from "./community-cover-art";
import { useShownCommunityThemeId } from "./community-theme-preview";
import { headingFontClass } from "./heading-fonts";

/**
 * The look as custom properties on the frame (token scoping): the site's own
 * tokens re-declared, so every component inside follows without knowing
 * themes exist; the canvas pattern, which `[data-community-theme]` in
 * globals.css paints; and the cover palette, for art drawn straight in the
 * frame (`CommunityCoverArt` carries its own).
 */
function themeProperties(theme: CommunityTheme): CSSProperties {
  const { tokens, canvasPattern, cover } = theme;
  const properties: Record<string, string> = {
    "--background": tokens.background,
    "--foreground": tokens.foreground,
    "--muted-foreground": tokens.mutedForeground,
    "--border": tokens.border,
    "--input": tokens.input,
  };
  if (tokens.card) properties["--card"] = tokens.card;
  if (tokens.cardForeground) {
    properties["--card-foreground"] = tokens.cardForeground;
  }
  if (canvasPattern) {
    properties["--community-canvas-image"] = canvasPattern.image;
    properties["--community-canvas-size"] = canvasPattern.size;
  }
  return {
    ...properties,
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
