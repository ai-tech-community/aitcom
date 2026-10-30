"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import {
  MAGAZINE_FONTS,
  MAGAZINE_FONT_OPTIONS,
  resolveMagazineFont,
  type MagazineFont,
} from "@/lib/magazines/typography";
import { Label } from "@/components/ui/label";

export function MagazineFontPicker({
  value,
  name,
  onChange,
}: {
  value: MagazineFont;
  name: string;
  onChange: (font: MagazineFont) => void;
}) {
  const t = useTranslations("magazineEditor.settings");
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={id}>{t("fontLabel")}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(resolveMagazineFont(event.target.value))}
        aria-describedby={`${id}-hint`}
        className="border-input bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2"
      >
        {MAGAZINE_FONTS.map((font) => (
          <option key={font} value={font}>
            {MAGAZINE_FONT_OPTIONS[font].label}
          </option>
        ))}
      </select>
      <p id={`${id}-hint`} className="text-muted-foreground text-sm">
        {t("fontHint")}
      </p>
      <div
        role="region"
        aria-label={t("fontPreview")}
        className="overflow-hidden border p-6 sm:p-8"
      >
        <p className="text-muted-foreground mb-5 text-xs">
          {MAGAZINE_FONT_OPTIONS[value].label}
        </p>
        <p
          data-testid="magazine-font-preview"
          className="text-4xl leading-tight break-words sm:text-5xl"
          style={{
            fontFamily: MAGAZINE_FONT_OPTIONS[value].family,
            fontWeight: 400,
          }}
        >
          {name.trim() || t("fontPreviewName")}
        </p>
        <p
          className="mt-4 text-xl leading-snug"
          style={{ fontFamily: MAGAZINE_FONT_OPTIONS[value].family }}
        >
          {t("fontPreviewHeadline")}
        </p>
      </div>
    </div>
  );
}
