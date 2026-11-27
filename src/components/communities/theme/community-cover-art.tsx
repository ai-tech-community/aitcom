import type { CSSProperties } from "react";

import {
  resolveCommunityTheme,
  type CommunityThemeCover,
  type CommunityThemeId,
} from "@/lib/communities/themes";
import { cn } from "@/lib/utils";

import { COMMUNITY_COVER_ART } from "./cover-art";

/**
 * A cover palette as the custom properties its art draws with,
 * `--community-cover-<role>`. The one place they are built: the art box
 * below and `CommunityThemeScope` both use it.
 */
export function coverPaletteProperties(
  cover: CommunityThemeCover | null,
): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const [role, color] of Object.entries(cover?.palette ?? {})) {
    properties[`--community-cover-${role}`] = color;
  }
  return properties;
}

/**
 * A look's cover art in a positioned box that carries the look's own
 * palette, so it draws correctly anywhere: inside a frame of another look
 * (a Settings tile) or of none. The caller sizes the box. Nothing for a
 * look without art (Plain).
 */
export function CommunityCoverArt({
  themeId,
  className,
}: {
  themeId: CommunityThemeId;
  className?: string;
}) {
  const theme = resolveCommunityTheme(themeId);
  const Art = COMMUNITY_COVER_ART[theme.id];
  if (!theme.cover || !Art) return null;
  return (
    <div
      data-community-cover-look={theme.id}
      className={cn("relative overflow-hidden", className)}
      style={coverPaletteProperties(theme.cover) as CSSProperties}
    >
      <Art />
    </div>
  );
}
