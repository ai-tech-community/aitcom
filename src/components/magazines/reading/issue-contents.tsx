import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { EditorItemView } from "@/lib/magazines/item-views";
import { SectionLabel } from "@/components/ui/section-label";

import { itemTitle } from "../items/registry";
import type { ArticleHref } from "../items/types";
import { EDITOR_NOTE_ANCHOR, itemAnchorId } from "./anchors";
import { EditorialImage } from "./editorial-image";

function ordinal(n: number): string {
  return String(n).padStart(2, "0");
}

function itemThumbnail(view: EditorItemView): string | null {
  if ("unavailable" in view) return null;
  switch (view.kind) {
    case "article":
      // An empty URL is no picture.
      if (view.article.imageUrl) return view.article.imageUrl;
      return null;
    case "galleryItem":
      // Signed for this request only; EditorialImage skips the optimizer.
      return view.thumbnailUrl;
    default:
      return null;
  }
}

function ContentsEntry({
  href,
  number,
  thumbnail,
  children,
}: {
  href: string;
  number: string;
  thumbnail: string | null;
  children: React.ReactNode;
}) {
  return (
    <li className="border-border border-b last:border-b-0">
      <Link
        href={href}
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
      </Link>
    </li>
  );
}

/**
 * The issue's table of contents: "From the editor" (when there is a note),
 * then every item in issue order, with the reading time and item count.
 * With nothing to read it says so, in words that are true both for an empty
 * issue and for one whose items this reader cannot open, without saying
 * which; an item count of zero is never shown.
 */
export function IssueContents({
  items,
  hasEditorNote,
  readingMinutes,
  articleHref,
}: {
  items: EditorItemView[];
  hasEditorNote: boolean;
  readingMinutes: number;
  articleHref: ArticleHref;
}) {
  const t = useTranslations("magazines");
  // Root-level, for item titles that are messages.
  const translate = useTranslations();
  const hasItems = items.length > 0;
  return (
    <nav aria-label={t("issue.contents")} className="flex flex-col gap-2">
      <SectionLabel as="p">{t("issue.contents")}</SectionLabel>
      {(hasEditorNote || hasItems) && (
        <ol>
          {hasEditorNote && (
            <ContentsEntry
              href={`#${EDITOR_NOTE_ANCHOR}`}
              number={ordinal(0)}
              thumbnail={null}
            >
              {t("issue.fromTheEditor")}
            </ContentsEntry>
          )}
          {items.map((view, index) => (
            <ContentsEntry
              key={view.itemId}
              href={
                !("unavailable" in view) && view.kind === "article"
                  ? articleHref(view.article.slug)
                  : `#${itemAnchorId(view.itemId)}`
              }
              number={ordinal(index + 1)}
              thumbnail={itemThumbnail(view)}
            >
              {itemTitle(view, translate) ??
                ("unavailable" in view
                  ? t("item.unavailable")
                  : t("item.untitledEditorial"))}
            </ContentsEntry>
          ))}
        </ol>
      )}
      {hasEditorNote || hasItems ? (
        <p className="text-muted-foreground font-mono text-xs">
          {t("issue.readingTime", { minutes: readingMinutes })}
          {hasItems && (
            <>
              <span aria-hidden="true"> · </span>
              {t("issue.contentsCount", { count: items.length })}
            </>
          )}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">{t("issue.noItems")}</p>
      )}
    </nav>
  );
}
