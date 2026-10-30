import { useFormatter, useTranslations } from "next-intl";

import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import { LexicalRenderer } from "@/lib/lexical";
import { lexicalHasText } from "@/lib/lexical-text";
import { magazinePath } from "@/lib/magazines/paths";
import { cn } from "@/lib/utils";

import { EDITOR_NOTE_ANCHOR } from "./anchors";
import { EditorialImage } from "./editorial-image";
import { type CoverArtIssue } from "./issue-cover-card";
import { issueNumberText } from "./issue-dateline";

/**
 * Whether the issue has an editor's note to show: an empty note is no note.
 * An editor that was cleared still holds an empty paragraph, so the test is
 * text, not blocks.
 */
export function hasEditorNote(note: unknown): boolean {
  return lexicalHasText(note);
}

/** What the hero shows of an issue: the reading page and the builder preview both have it. */
export type IssueHeroIssue = CoverArtIssue & {
  publishedAt: string | null;
  magazine: { name: string; slug: string };
  community: { name: string };
  /** The rich-text editor's note; empty or null when there is none. */
  editorNote: unknown;
  /** Who signs the note: the editor who published the issue. */
  signedBy: string | null;
};

/**
 * The opening of an issue: a full-bleed cover with the serif masthead over
 * the photograph, then the editor's note. Without a cover the masthead is
 * typeset on the page. The masthead links to the magazine's shelf.
 */
export function IssueHero({
  issue,
  titleAs: Title = "h1",
  titleId,
}: {
  issue: IssueHeroIssue;
  /** `h1` on the reading page; the builder preview sits under the builder's own `h1`. */
  titleAs?: "h1" | "h2";
  titleId?: string;
}) {
  const t = useTranslations("magazines.issue");
  const format = useFormatter();
  const showNote = hasEditorNote(issue.editorNote);
  const noteLabelId = `${EDITOR_NOTE_ANCHOR}-label`;
  const cover = issue.coverImageUrl;

  return (
    <header className="flex flex-col gap-8">
      <div
        className={cn(
          "relative",
          cover ? "min-h-[28rem] sm:min-h-[36rem]" : "border-b",
        )}
      >
        {cover ? (
          <>
            <EditorialImage
              src={cover}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/25"
            />
          </>
        ) : null}
        <div
          className={cn(
            "relative z-10 flex min-h-[28rem] flex-col justify-end gap-4 px-4 py-10 sm:min-h-[36rem] sm:px-8 sm:py-14",
            cover ? "text-white" : "text-foreground min-h-0 sm:min-h-0",
          )}
        >
          <Link
            href={magazinePath(issue.magazine)}
            className="magazine-display max-w-[16ch] text-5xl leading-[0.9] font-medium tracking-tight break-words underline-offset-4 hover:underline sm:text-7xl lg:text-8xl"
          >
            {issue.magazine.name}
          </Link>
          <p
            className={cn(
              "font-mono text-xs tracking-[0.18em] uppercase",
              cover
                ? "text-white/80"
                : "text-[color:var(--magazine-accent-ink)]",
            )}
          >
            {t("number", { number: issueNumberText(issue.number) })}
          </p>
          <Title
            id={titleId}
            tabIndex={titleId ? -1 : undefined}
            className="magazine-display max-w-[22ch] text-3xl leading-tight font-medium text-balance break-words sm:text-5xl"
          >
            {issue.title}
          </Title>
          <p
            className={cn(
              "text-sm",
              cover ? "text-white/85" : "text-muted-foreground",
            )}
          >
            {t("byCommunity", { community: issue.community.name })}
            {issue.publishedAt && (
              <>
                {" · "}
                <time dateTime={issue.publishedAt}>
                  {t("published", {
                    date: format.dateTime(new Date(issue.publishedAt), {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }),
                  })}
                </time>
              </>
            )}
          </p>
        </div>
      </div>

      {showNote && (
        <section
          id={EDITOR_NOTE_ANCHOR}
          aria-labelledby={noteLabelId}
          className="flex scroll-mt-24 flex-col gap-3"
        >
          <SectionLabel id={noteLabelId}>{t("fromTheEditor")}</SectionLabel>
          <div className="font-magazine-serif max-w-[68ch] min-w-0 text-lg leading-relaxed">
            <LexicalRenderer content={issue.editorNote} />
          </div>
          {issue.signedBy && (
            <p className="text-muted-foreground text-sm">
              {t("signature", { name: issue.signedBy })}
            </p>
          )}
        </section>
      )}
    </header>
  );
}
