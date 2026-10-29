import { useTranslations } from "next-intl";

import type { EditorItemView } from "@/lib/magazines/item-views";
import { SectionLabel } from "@/components/ui/section-label";

import { itemTitle } from "../items/registry";
import { EDITOR_NOTE_ANCHOR, itemAnchorId } from "./anchors";
import { EditorialImage } from "./editorial-image";

function ordinal(n: number): string {
  return String(n).padStart(2, "0");
}

function itemThumbnail(view: EditorItemView): string | null {
  if ("unavailable" in view) return null;
  if (view.kind === "article" && view.article.imageUrl)
    return view.article.imageUrl;
  return null;
}

function ContentsEntry({
  anchor,
  number,
  thumbnail,
  children,
}: {
  anchor: string;
  number: string;
  thumbnail: string | null;
  children: React.ReactNode;
}) {
  return (
    <li className="border-border border-b last:border-b-0">
      <a
        href={`#${anchor}`}
        className="hover:text-foreground flex items-center gap-3 py-2.5 text-sm leading-snug underline-offset-4 hover:underline"
      >
        {thumbnail ? (
          <span className="bg-secondary relative block h-14 w-10 shrink-0 overflow-hidden">
            <EditorialImage
              src={thumbnail}
              alt=""
              fill
              sizes="40px"
              className="object-cover"
            />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="text-muted-foreground w-10 shrink-0 pt-px text-center font-mono text-xs"
          >
            {number}
          </span>
        )}
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
          <ContentsEntry
            anchor={EDITOR_NOTE_ANCHOR}
            number={ordinal(0)}
            thumbnail={null}
          >
            {t("issue.fromTheEditor")}
          </ContentsEntry>
        )}
        {items.map((view, index) => (
          <ContentsEntry
            key={view.itemId}
            anchor={itemAnchorId(view.itemId)}
            number={ordinal(index + 1)}
            thumbnail={itemThumbnail(view)}
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
