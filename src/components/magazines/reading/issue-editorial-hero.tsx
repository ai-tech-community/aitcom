import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LexicalRenderer } from "@/lib/lexical";
import { magazinePath } from "@/lib/magazines/paths";
import { EDITOR_NOTE_ANCHOR } from "./anchors";
import { hasEditorNote, type IssueHeroIssue } from "./issue-hero";
import { issueNumberText } from "./issue-dateline";

/** The real cover and issue text, composed as the opening of a publication. */
export function IssueEditorialHero({
  issue,
  titleId,
  titleAs: Title = "h1",
}: {
  issue: IssueHeroIssue;
  titleId?: string;
  titleAs?: "h1" | "h2";
}) {
  const t = useTranslations("magazines.issue");
  const format = useFormatter();
  return (
    <header className="magazine-issue-hero">
      <Link
        href={magazinePath(issue.magazine)}
        className="magazine-masthead magazine-display"
      >
        {issue.magazine.name}
      </Link>
      <div className="magazine-dateline">
        <span>{t("number", { number: issueNumberText(issue.number) })}</span>
        <span>{t("byCommunity", { community: issue.community.name })}</span>
        {issue.publishedAt && (
          <time dateTime={issue.publishedAt}>
            {t("published", {
              date: format.dateTime(new Date(issue.publishedAt), {
                day: "numeric",
                month: "long",
                year: "numeric",
              }),
            })}
          </time>
        )}
      </div>
      <div
        className={`magazine-cover ${issue.coverImageUrl ? "magazine-cover-image" : "magazine-cover-typeset"}`}
      >
        {issue.coverImageUrl && (
          // An editor may use a cover on any image host.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={issue.coverImageUrl} alt="" fetchPriority="high" />
        )}
        <Title
          id={titleId}
          tabIndex={titleId ? -1 : undefined}
          className="magazine-cover-title magazine-display"
        >
          {issue.title}
        </Title>
      </div>
      {hasEditorNote(issue.editorNote) && (
        <section
          id={EDITOR_NOTE_ANCHOR}
          aria-labelledby={`${EDITOR_NOTE_ANCHOR}-label`}
          className="magazine-editor-note"
        >
          <h2 id={`${EDITOR_NOTE_ANCHOR}-label`} className="magazine-display">
            {t("fromTheEditor")}
          </h2>
          <div>
            <LexicalRenderer content={issue.editorNote} />
            {issue.signedBy && (
              <p className="magazine-signature">
                {t("signature", { name: issue.signedBy })}
              </p>
            )}
          </div>
        </section>
      )}
    </header>
  );
}
