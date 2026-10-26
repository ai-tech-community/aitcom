"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { RichTextEditor } from "@/components/article-editor/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "@/components/ui/section-label";
import { extractPlainText } from "@/lib/lexical";

import type { BuilderItemEditorProps, BuilderItemKind } from "./types";

const HEADING_MAX = 160;
/** Most characters of a block's text that name its row (CSS truncates the rest). */
const ROW_TEXT_CHARS = 120;

/** The plain text of a Lexical state ("" for anything else). */
function plainTextOf(state: unknown): string {
  const children = (state as { root?: { children?: unknown } } | null)?.root
    ?.children;
  return Array.isArray(children)
    ? extractPlainText(children as Parameters<typeof extractPlainText>[0])
    : "";
}

/** Whether a Lexical state holds some text. */
export function lexicalHasText(state: unknown): boolean {
  return plainTextOf(state).trim().length > 0;
}

/**
 * Writes one editorial block: an optional heading and its text. Changes go
 * straight into the builder's item list and autosave with it; an empty
 * block waits until it has text.
 */
export function EditorialItemEditor({
  item,
  onChange,
  onDone,
}: BuilderItemEditorProps<"editorial">) {
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
      <div className="flex flex-col gap-1.5">
        {/* Names the writing surface itself (its textbox), not a wrapper. */}
        <p id={bodyLabelId} className="text-sm leading-none font-medium">
          {t("body")}
        </p>
        {/* Keyed by item: each block starts its own editor. */}
        <RichTextEditor
          key={item.key}
          initialValue={item.body}
          onChange={(body) => onChange({ body })}
          placeholder={t("bodyPlaceholder")}
          contentClassName="min-h-32"
          ariaLabelledBy={bodyLabelId}
        />
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

/**
 * An editorial block: text the issue owns. Its row is named by its heading,
 * else its first words; it is written in its own panel and previewed from
 * the working copy, so the preview follows the editor's typing.
 */
export const editorialBuilderKind: BuilderItemKind<"editorial"> = {
  labelKey: "editorial",
  rowTitle(item, ctx) {
    const heading = item.heading?.trim();
    if (heading) return heading;
    const text = plainTextOf(item.body).trim();
    return text ? text.slice(0, ROW_TEXT_CHARS) : ctx.t("editorialEmpty");
  },
  Editor: EditorialItemEditor,
  // The server's `ITEM_INVALID` rule: a block needs some text.
  isSavable: (item) => lexicalHasText(item.body),
  previewView: (item) => ({
    kind: "editorial",
    itemId: item.key,
    intro: item.intro ?? null,
    heading: item.heading ?? null,
    body: item.body,
  }),
};
