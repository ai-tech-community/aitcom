"use client";

import { useId } from "react";
import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { CommunityCoverArt } from "@/components/communities/theme/community-cover-art";
import { Badge } from "@/components/ui/badge";
import type { CommunityTheme } from "@/lib/communities/themes";

/**
 * The look's colors on the miniature box itself, as plain inline styles.
 * Not a `CommunityThemeScope`: scopes cannot nest, and the tile sits inside
 * the community frame. A light look without a card color keeps white cards,
 * as the frame does.
 */
function miniatureStyles(theme: CommunityTheme): {
  canvas: CSSProperties;
  card: CSSProperties;
  line: CSSProperties;
} {
  const { tokens, canvasPattern } = theme;
  return {
    canvas: {
      backgroundColor: tokens.background,
      backgroundImage: canvasPattern?.image,
      backgroundSize: canvasPattern?.size,
      borderColor: tokens.border,
    },
    card: {
      backgroundColor: tokens.card ?? "#FFFFFF",
      color: tokens.cardForeground ?? tokens.foreground,
      borderColor: tokens.border,
    },
    line: { backgroundColor: tokens.mutedForeground },
  };
}

/**
 * One look in the Themes radio group: a small drawing of the community page
 * in that look (its canvas, its cover art or the community's own banner, a
 * card with the community's name), then the look's name and description.
 * The drawing is decorative; the radio is named by the look's name and
 * described by its description (and "Current" for the saved look).
 */
export function ThemeTile({
  theme,
  communityName,
  bannerUrl,
  isCurrent,
}: {
  theme: CommunityTheme;
  communityName: string;
  bannerUrl: string | null;
  isCurrent: boolean;
}) {
  const t = useTranslations("communities.settings.themes");
  const tLook = useTranslations("communities.themes");
  const id = useId();
  const nameId = `${id}-name`;
  const currentId = `${id}-current`;
  const descriptionId = `${id}-description`;
  const styles = miniatureStyles(theme);
  const hasCover = bannerUrl !== null || theme.cover !== null;

  return (
    <RadioGroupPrimitive.Item
      value={theme.id}
      aria-labelledby={nameId}
      aria-describedby={
        isCurrent ? `${currentId} ${descriptionId}` : descriptionId
      }
      data-community-theme-tile={theme.id}
      className="group bg-card text-card-foreground border-border hover:bg-secondary/50 focus-visible:border-ring focus-visible:ring-ring/50 data-[state=checked]:border-foreground data-[state=checked]:inset-ring-foreground relative flex flex-col gap-3 rounded-xl border p-3 text-start transition-colors outline-none focus-visible:ring-[3px] data-[state=checked]:inset-ring-1"
    >
      <span
        aria-hidden="true"
        className="flex h-32 flex-col gap-2 overflow-hidden rounded-lg border p-2"
        style={styles.canvas}
      >
        {hasCover ? (
          <span className="relative block h-10 shrink-0 overflow-hidden rounded-md">
            {bannerUrl ? (
              // Uploaded hosts are not limited to next/image's allow list.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bannerUrl}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <CommunityCoverArt themeId={theme.id} className="size-full" />
            )}
          </span>
        ) : null}
        <span
          className="flex min-h-0 flex-1 flex-col gap-1.5 rounded-md border px-2 py-1.5"
          style={styles.card}
        >
          <span dir="auto" className="truncate text-xs font-semibold">
            {communityName}
          </span>
          <span
            className="block h-1 w-4/5 rounded-full opacity-40"
            style={styles.line}
          />
          <span
            className="block h-1 w-3/5 rounded-full opacity-40"
            style={styles.line}
          />
        </span>
      </span>

      <span className="flex flex-col gap-1">
        <span className="flex items-center gap-2">
          <span id={nameId} className="text-sm font-medium">
            {tLook(`${theme.id}.name`)}
          </span>
          {isCurrent ? (
            <Badge id={currentId} variant="secondary">
              {t("current")}
            </Badge>
          ) : null}
        </span>
        <span id={descriptionId} className="text-muted-foreground text-xs">
          {tLook(`${theme.id}.description`)}
        </span>
      </span>

      {/* The chosen tile's non-color cue, beside its ink border. */}
      <span
        aria-hidden="true"
        className="bg-foreground text-background absolute end-5 top-5 hidden size-5 items-center justify-center rounded-full group-data-[state=checked]:flex"
      >
        <Check className="size-3.5" />
      </span>
    </RadioGroupPrimitive.Item>
  );
}
