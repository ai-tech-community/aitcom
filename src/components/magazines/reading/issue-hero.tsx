import { useFormatter, useTranslations } from "next-intl";

import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import { LexicalRenderer } from "@/lib/lexical";
import { lexicalHasText } from "@/lib/lexical-text";
import { magazinePath } from "@/lib/magazines/paths";

import { EDITOR_NOTE_ANCHOR } from "./anchors";
import { type CoverArtIssue, IssueCoverArt } from "./issue-cover-card";
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
 * The opening of an issue (mockup screen 2): one card with the large cover
 * beside the masthead, the issue title, its community and publish date and
 * the editor's note with its signature. Without a cover image the cover is
 * typeset (issue number, masthead, title). Side by side from the card's own
 * `3xl` width; stacked, cover first, below it.
 *
 * The masthead links to the magazine's shelf, so every issue, the first one
 * included, leads back to the magazine.
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

  return (
    <header className="bg-card text-card-foreground @container overflow-hidden rounded-xl border">
      <div className="grid @3xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="p-5 pb-0 @3xl:p-0">
          <IssueCoverArt
            issue={issue}
            size="hero"
            className="max-w-72 @3xl:aspect-auto @3xl:h-full @3xl:min-h-96 @3xl:max-w-none @3xl:rounded-none @3xl:border-0"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-6 p-5 @3xl:p-8">
          <div className="flex flex-col gap-2">
            <Link
              href={magazinePath(issue.magazine)}
              className="self-start text-sm font-semibold break-words underline-offset-4 hover:underline"
            >
              {issue.magazine.name}
            </Link>
            <p className="text-muted-foreground font-mono text-xs">
              {t("number", { number: issueNumberText(issue.number) })}
            </p>
            <Title
              id={titleId}
              tabIndex={titleId ? -1 : undefined}
              className="text-3xl leading-tight font-semibold tracking-tight text-balance break-words @3xl:text-4xl"
            >
              {issue.title}
            </Title>
            <p className="text-muted-foreground text-sm">
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

          {showNote && (
            <section
              id={EDITOR_NOTE_ANCHOR}
              aria-labelledby={noteLabelId}
              className="flex scroll-mt-24 flex-col gap-3"
            >
              <SectionLabel id={noteLabelId}>{t("fromTheEditor")}</SectionLabel>
              <div className="min-w-0">
                <LexicalRenderer content={issue.editorNote} />
              </div>
              {issue.signedBy && (
                <p className="text-muted-foreground text-sm">
                  {t("signature", { name: issue.signedBy })}
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </header>
  );
}
