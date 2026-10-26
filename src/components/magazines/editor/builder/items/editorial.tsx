"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { RichTextEditor } from "@/components/article-editor/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lexicalHasText, lexicalPlainText } from "@/lib/lexical-text";

import type {
  AddPanelProps,
  BuilderItemEditorProps,
  BuilderItemKind,
} from "./types";

const HEADING_MAX = 160;
/** Most characters of a block's text that name its row (CSS truncates the rest). */
const ROW_TEXT_CHARS = 120;

/** "Add more" for a text section: a hint and one button. */
function EditorialAddPanel({ onAdd }: AddPanelProps) {
  const t = useTranslations("magazineEditor.builder.add");
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{t("editorialHint")}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() =>
          onAdd(
            { kind: "editorial", body: null },
            { title: null, openHref: null },
          )
        }
      >
        <Plus aria-hidden="true" />
        {t("addEditorial")}
      </Button>
    </div>
  );
}

/**
 * Writes one editorial block: an optional heading and its text. The details
 * panel supplies the intro line and Done; changes go straight into the
 * builder's item list and autosave with it. An empty block waits until it
 * has text.
 */
export function EditorialItemEditor({
  item,
  onChange,
}: BuilderItemEditorProps<"editorial">) {
  const t = useTranslations("magazineEditor.builder.editorial");
  const headingId = useId();
  const bodyLabelId = useId();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={headingId}>{t("heading")}</Label>
        <Input
          id={headingId}
          value={item.heading ?? ""}
          maxLength={HEADING_MAX}
          onChange={(event) =>
            onChange({
              heading: event.target.value ? event.target.value : undefined,
            })
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
    </div>
  );
}

/**
 * An editorial block: text the issue owns. Its row is named by its heading,
 * else its first words; it is written under the shared intro line and
 * previewed from the working copy, so the preview follows the typing.
 */
export const editorialBuilderKind: BuilderItemKind<"editorial"> = {
  labelKey: "editorial",
  rowTitle(item, ctx) {
    const heading = item.heading?.trim();
    if (heading) return heading;
    const text = lexicalPlainText(item.body);
    return text ? text.slice(0, ROW_TEXT_CHARS) : ctx.t("editorialEmpty");
  },
  Editor: EditorialItemEditor,
  // The server's `ITEM_INVALID` rule: a block needs some text. Both sides
  // use `lexicalHasText`, so a save the server would refuse is never sent
  // (ruling 85).
  isSavable: (item) => lexicalHasText(item.body),
  previewView: (item) => ({
    kind: "editorial",
    itemId: item.key,
    intro: item.intro ?? null,
    heading: item.heading ?? null,
    body: item.body,
  }),
  AddPanel: EditorialAddPanel,
};
