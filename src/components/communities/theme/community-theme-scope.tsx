"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

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

/**
 * The floating layer's custom properties: the look, on its card's ground.
 * A layer holds dialogs, sheets and menus, which sit on the look's card
 * color, never on the canvas: light looks keep the house white (`--background`
 * is not re-declared), a look with its own card (Night) re-declares the
 * ground and its ink as the card's.
 */
function layerProperties(theme: CommunityTheme): Record<string, string> {
  const properties = lookProperties(theme);
  const { card, cardForeground, foreground } = theme.tokens;
  delete properties["--background"];
  if (card) {
    properties["--background"] = card;
    properties["--foreground"] = cardForeground ?? foreground;
  }
  return properties;
}

/** `lookProperties` keys are React style names; the DOM wants CSS names. */
function cssPropertyName(name: string): string {
  return name === "colorScheme" ? "color-scheme" : name;
}

/**
 * The look's floating layer: an element on `body` that dialogs, sheets,
 * menus, popovers, selects and tooltips opened from the frame mount in
 * (through `PortalContainerProvider`). Their portals put them on `body`,
 * where the frame's tokens do not reach; the layer wears the same look, so
 * they match it. It sits on `body`, so no frame ancestor can clip or
 * re-stack them, and it is `display: contents`, so it adds no box.
 *
 * The element is created and appended before the first paint in the
 * browser (layout effect), not during render, so the server's markup and
 * the first client render agree (no portal renders in either). Radix
 * portals render nothing on their own first pass either, so a layer open
 * on first paint mounts here directly, never on `body` first.
 */
function useFloatingLayer(theme: CommunityTheme): {
  layer: HTMLElement | null;
  resolveLayer: () => HTMLElement | undefined;
} {
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  // Set with the element, before any passive effect of the same commit, so
  // a dialog asked for from such an effect (a deep link on first load)
  // finds the layer although `layer` is still the first render's null.
  const layerRef = useRef<HTMLElement | null>(null);
  const resolveLayer = useCallback(() => layerRef.current ?? undefined, []);

  useLayoutEffect(() => {
    const element = document.createElement("div");
    document.body.append(element);
    layerRef.current = element;
    // Subscribing to a DOM node React does not render: the state is the
    // node itself, set once it exists.
    setLayer(element);
    return () => {
      element.remove();
      layerRef.current = null;
      setLayer(null);
    };
  }, []);

  useLayoutEffect(() => {
    if (!layer) return;
    layer.setAttribute("data-community-theme-layer", theme.id);
    // `text-foreground` makes text inside take the look's ink; without it,
    // text inherits the color `body` computed from the house tokens.
    layer.className = cn(lookClassName(theme), "contents text-foreground");
    layer.removeAttribute("style");
    for (const [name, value] of Object.entries(layerProperties(theme))) {
      layer.style.setProperty(cssPropertyName(name), value);
    }
  }, [layer, theme]);

  return { layer, resolveLayer };
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
  const { layer, resolveLayer } = useFloatingLayer(theme);
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
      <PortalContainerProvider container={layer} resolve={resolveLayer}>
        {children}
      </PortalContainerProvider>
    </div>
  );
}
