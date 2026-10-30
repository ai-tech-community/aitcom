import { useTranslations } from "next-intl";

import type { EditorItemView } from "@/lib/magazines/item-views";
import { SectionLabel } from "@/components/ui/section-label";

import { itemTitle } from "../items/registry";
import { EDITOR_NOTE_ANCHOR, itemAnchorId } from "./anchors";

function ordinal(n: number): string {
  return String(n).padStart(2, "0");
}

function ContentsEntry({
  anchor,
  number,
  children,
}: {
  anchor: string;
  number: string;
  children: React.ReactNode;
}) {
  return (
    <li className="border-border border-b last:border-b-0">
      <a
        href={`#${anchor}`}
        className="hover:text-foreground flex gap-3 py-2.5 text-sm leading-snug underline-offset-4 hover:underline"
      >
        <span
          aria-hidden="true"
          className="text-muted-foreground shrink-0 pt-px font-mono text-xs"
        >
          {number}
        </span>
        <span className="min-w-0 break-words">{children}</span>
      </a>
    </li>
  );
}

/**
 * The issue's table of contents: "From the editor" (when there is a note),
 * then every item in issue order, with the reading time and item count.
 */
export function IssueContents({
  items,
  hasEditorNote,
  readingMinutes,
}: {
  items: EditorItemView[];
  hasEditorNote: boolean;
  readingMinutes: number;
}) {
  const t = useTranslations("magazines");
  return (
    <nav aria-label={t("issue.contents")} className="flex flex-col gap-2">
      <SectionLabel as="p">{t("issue.contents")}</SectionLabel>
      <ol>
        {hasEditorNote && (
          <ContentsEntry anchor={EDITOR_NOTE_ANCHOR} number={ordinal(0)}>
            {t("issue.fromTheEditor")}
          </ContentsEntry>
        )}
        {items.map((view, index) => (
          <ContentsEntry
            key={view.itemId}
            anchor={itemAnchorId(view.itemId)}
            number={ordinal(index + 1)}
          >
            {itemTitle(view) ??
              ("unavailable" in view
                ? t("item.unavailable")
                : t("item.untitledEditorial"))}
          </ContentsEntry>
        ))}
      </ol>
      <p className="text-muted-foreground font-mono text-xs">
        {t("issue.readingTime", { minutes: readingMinutes })}
        <span aria-hidden="true"> · </span>
        {t("issue.contentsCount", { count: items.length })}
      </p>
    </nav>
  );
}
