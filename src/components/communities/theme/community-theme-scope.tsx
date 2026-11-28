"use client";

import {
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { PortalContainerProvider } from "@/components/ui/portal-container";

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
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  success: "--success",
  warning: "--warning",
  info: "--info",
  destructive: "--destructive",
};

/**
 * What the look sets wherever its content shows, on the frame and on the
 * layer floating content opens in: the site's own tokens re-declared, so
 * every component follows without knowing themes exist (token scoping);
 * the heading face's needs; and `color-scheme`, so scrollbars and form
 * controls the browser draws match.
 */
function lookProperties(theme: CommunityTheme): Record<string, string> {
  const properties: Record<string, string> = {
    colorScheme: theme.scheme,
    ...headingFontProperties(theme.headingFont),
  };
  for (const [token, property] of Object.entries(TOKEN_PROPERTIES)) {
    const value = theme.tokens[token as keyof CommunityThemeTokens];
    if (value) properties[property] = value;
  }
  return properties;
}

/**
 * The frame adds what only the page shows: the canvas pattern, which
 * `[data-community-theme]` in globals.css paints, and the cover palette, for
 * art drawn straight in the frame (`CommunityCoverArt` carries its own).
 */
function frameProperties(theme: CommunityTheme): CSSProperties {
  const { canvasPattern, cover } = theme;
  const properties = lookProperties(theme);
  if (canvasPattern) {
    properties["--community-canvas-image"] = canvasPattern.image;
    properties["--community-canvas-size"] = canvasPattern.size;
  }
  return {
    ...properties,
    ...coverPaletteProperties(cover),
  } as CSSProperties;
}

/** The look's classes: the `.dark` tokens first for a dark look, and the face. */
function lookClassName(theme: CommunityTheme): string {
  return cn(
    theme.scheme === "dark" && "dark",
    headingFontClass(theme.headingFont),
  );
}

/** Nothing to subscribe to: whether the page runs in a browser never changes. */
function subscribeToNothing(): () => void {
  return () => undefined;
}

/**
 * True once the page runs in the browser, false while it renders on the
 * server and during hydration, so the server and client markup agree.
 */
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
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
  const isClient = useIsClient();
  // Dialogs, menus and popovers mount outside the frame (on `body`), where
  // its tokens do not reach. They mount in this layer instead, which wears
  // the same look but paints nothing itself, and which sits on `body` so no
  // frame ancestor can clip or re-stack them.
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  return (
    <div
      data-community-theme={theme.id}
      className={cn(
        lookClassName(theme),
        "bg-background text-foreground",
        className,
      )}
      style={frameProperties(theme)}
    >
      <PortalContainerProvider container={layer}>
        {children}
      </PortalContainerProvider>
      {isClient
        ? createPortal(
            <div
              ref={setLayer}
              data-community-theme-layer={theme.id}
              className={cn(lookClassName(theme), "contents")}
              style={lookProperties(theme) as CSSProperties}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
