"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { RichTextEditor } from "@/components/article-editor/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "@/components/ui/section-label";

import type { BuilderItem } from "./items-model";

export type EditorialBuilderItem = Extract<BuilderItem, { kind: "editorial" }>;

const HEADING_MAX = 160;

/**
 * Writes one editorial block: an optional heading and its text. Changes go
 * straight into the builder's item list and autosave with it; an empty
 * block waits until it has text.
 */
export function EditorialItemEditor({
  item,
  onChange,
  onDone,
}: {
  item: EditorialBuilderItem;
  onChange: (
    patch: Partial<Pick<EditorialBuilderItem, "heading" | "body">>,
  ) => void;
  onDone: () => void;
}) {
  const t = useTranslations("magazineEditor.builder.editorial");
  const labelId = useId();
  const headingId = useId();
  const bodyLabelId = useId();

  return (
    <section
      aria-labelledby={labelId}
      className="flex flex-col gap-4 rounded-lg border p-4"
    >
      <SectionLabel id={labelId}>{t("label")}</SectionLabel>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={headingId}>{t("heading")}</Label>
        <Input
          id={headingId}
          value={item.heading ?? ""}
          maxLength={HEADING_MAX}
          onChange={(e) =>
            onChange({ heading: e.target.value ? e.target.value : undefined })
          }
        />
      </div>
      <div
        role="group"
        aria-labelledby={bodyLabelId}
        className="flex flex-col gap-1.5"
      >
        <p id={bodyLabelId} className="text-sm leading-none font-medium">
          {t("body")}
        </p>
        <div className="rounded-md border px-3 py-2">
          {/* Keyed by item: each block starts its own editor. */}
          <RichTextEditor
            key={item.key}
            initialValue={item.body}
            onChange={(body) => onChange({ body })}
            placeholder={t("bodyPlaceholder")}
            contentClassName="min-h-32"
          />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={onDone}
      >
        {t("done")}
      </Button>
    </section>
  );
}
