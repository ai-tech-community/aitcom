import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ComponentProps } from "react";

import { ArticleComments } from "@/components/blog/article-comments";
import { BlogToc } from "@/components/blog/blog-toc";
import { JsonLd } from "@/components/json-ld";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import {
  estimateReadingTime,
  extractHeadings,
  LexicalRenderer,
} from "@/lib/lexical";
import { seesEditorLayer } from "@/lib/magazines/access";
import {
  isMagazineArticleIndexable,
  isMagazineArticleOut,
} from "@/lib/magazines/indexing";
import {
  issuePath,
  magazineArticlePath,
  magazinePath,
} from "@/lib/magazines/paths";
import { absoluteLocaleUrl } from "@/lib/metadata";
import type { MagazineArticlePageData } from "@/server/magazines/reading";

import { ArticleItem } from "../items/article-item";
import { READING_FRAME } from "./frame";
import { issueNumberText } from "./issue-dateline";

/** The comments a page hands the shared thread, as the blog does. */
export type MagazineArticleComments = ComponentProps<
  typeof ArticleComments
>["initialComments"];

/** A contents list is worth showing from this many headings (as on the blog). */
const MIN_TOC_HEADINGS = 2;

const NEXT_IN_ISSUE_LABEL = "next-in-issue-label";

/**
 * `Article` structured data, part of its issue and magazine. Only for an
 * article search engines may index (effective visibility, preflight F10).
 */
function ArticleJsonLd({
  data,
  locale,
}: {
  data: MagazineArticlePageData;
  locale: string;
}) {
  const { magazine, issue, article } = data;
  return (
    <JsonLd
      data={{
        "@type": "Article",
        headline: article.title,
        url: absoluteLocaleUrl(
          locale,
          magazineArticlePath(magazine, issue, article),
        ),
        ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
        dateModified: article.updatedAt,
        ...(article.mediaUrl ? { image: article.mediaUrl } : {}),
        ...(article.authorName
          ? { author: { "@type": "Person", name: article.authorName } }
          : {}),
        isPartOf: {
          "@type": "PublicationIssue",
          issueNumber: issue.number,
          name: issue.title,
          url: absoluteLocaleUrl(locale, issuePath(magazine, issue)),
          isPartOf: {
            "@type": "Periodical",
            name: magazine.name,
            url: absoluteLocaleUrl(locale, magazinePath(magazine)),
          },
        },
      }}
    />
  );
}

/** "Agents Weekly › Issue 04": where the article sits, both linked. */
function ContextLine({ data }: { data: MagazineArticlePageData }) {
  const t = useTranslations("magazines");
  const { magazine, issue } = data;
  return (
    <nav aria-label={t("article.context")}>
      <ol className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        <li>
          <Link
            href={magazinePath(magazine)}
            className="hover:text-foreground font-medium underline-offset-4 hover:underline"
          >
            {magazine.name}
          </Link>
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true">›</span>
          <Link
            href={issuePath(magazine, issue)}
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            {t("issue.number", { number: issueNumberText(issue.number) })}
          </Link>
        </li>
      </ol>
    </nav>
  );
}

/** Author in words; reading time and date in mono (Mono-Is-Machine). */
function Byline({ data }: { data: MagazineArticlePageData }) {
  const t = useTranslations("magazines.article");
  const format = useFormatter();
  const { article } = data;
  const parts = [
    article.authorName ? (
      <span key="author">{t("byAuthor", { name: article.authorName })}</span>
    ) : null,
    <span key="time" className="font-mono text-xs">
      {t("readingTime", { minutes: estimateReadingTime(article.content) })}
    </span>,
    article.publishedAt ? (
      <time
        key="date"
        dateTime={article.publishedAt}
        className="font-mono text-xs"
      >
        {format.dateTime(new Date(article.publishedAt), {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </time>
    ) : null,
  ].filter((part) => part !== null);

  return (
    <p className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      {parts.flatMap((part, i) =>
        i === 0
          ? [part]
          : [
              <span key={`sep-${i}`} aria-hidden="true">
                ·
              </span>,
              part,
            ],
      )}
    </p>
  );
}

/** The next article in the issue, or the way back to the issue after the last. */
function NextInIssue({ data }: { data: MagazineArticlePageData }) {
  const t = useTranslations("magazines.article");
  const { magazine, issue, nextInIssue } = data;
  return (
    <section
      aria-labelledby={NEXT_IN_ISSUE_LABEL}
      className="@container flex flex-col gap-4"
    >
      <SectionLabel id={NEXT_IN_ISSUE_LABEL}>{t("nextInIssue")}</SectionLabel>
      {nextInIssue ? (
        <ArticleItem
          view={nextInIssue}
          lead={false}
          href={(slug) => magazineArticlePath(magazine, issue, { slug })}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("lastInIssue")}{" "}
          <Link
            href={issuePath(magazine, issue)}
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {t("backToIssue")}
          </Link>
        </p>
      )}
    </section>
  );
}

/**
 * The magazine article long-read (DESIGN.md frame exception for the issue
 * reading view): the wide frame, with the text at a reading measure and the
 * headings' contents list beside it from `lg`. Readers reach this page only
 * for a published article in a published issue they may read; editors also
 * preview drafts, with a note and without the comment thread.
 */
export function MagazineArticle({
  data,
  comments,
  currentUserId,
}: {
  data: MagazineArticlePageData;
  comments: MagazineArticleComments;
  currentUserId?: string;
}) {
  const t = useTranslations("magazines.article");
  const locale = useLocale();
  const { access, issue, article } = data;
  const headings = extractHeadings(article.content);
  const showToc = headings.length >= MIN_TOC_HEADINGS;
  const readersSeeIt = isMagazineArticleOut(issue, article);

  return (
    <div className={READING_FRAME}>
      {isMagazineArticleIndexable(issue, article) && (
        <ArticleJsonLd data={data} locale={locale} />
      )}
      <div className="flex justify-center gap-12">
        <article className="flex w-full max-w-[72ch] min-w-0 flex-col gap-8">
          {seesEditorLayer(access) && !readersSeeIt && (
            <p className="bg-secondary/60 text-muted-foreground rounded-lg border px-4 py-2.5 text-sm">
              {t("draftNotice")}
            </p>
          )}
          <header className="flex flex-col gap-3">
            <ContextLine data={data} />
            <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance break-words sm:text-4xl">
              {article.title}
            </h1>
            <Byline data={data} />
          </header>
          {article.mediaUrl && (
            // Any host an editor links to: next/image only serves listed hosts.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.mediaUrl}
              alt=""
              className="aspect-[2/1] w-full rounded-xl border object-cover"
            />
          )}
          <div className="min-w-0 border-t pt-8">
            <LexicalRenderer content={article.content} />
          </div>
          <NextInIssue data={data} />
          {readersSeeIt && (
            <ArticleComments
              articleId={article.id}
              initialComments={comments}
              currentUserId={currentUserId}
            />
          )}
        </article>
        {showToc && <BlogToc headings={headings} label={t("contents")} />}
      </div>
    </div>
  );
}
