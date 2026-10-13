import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  storylineCopy,
  storylineTimeline,
  type StorylineMembership,
} from "@/lib/news/storylines";
import type {
  StorylineSummary,
  StorylineDetail,
  relatedStorylines,
} from "@/server/news/storylines";

export function StorylineList({ items }: { items: StorylineSummary[] }) {
  const t = useTranslations("newsStories");
  const locale = useLocale();
  return (
    <div className="border-border border-t">
      {items.map((item) => {
        const copy = storylineCopy(item, locale);
        return (
          <article
            key={item.id}
            className="border-border grid gap-3 border-b py-6 sm:grid-cols-[1fr_12rem] sm:gap-8"
          >
            <div>
              <Link
                href={`/news/stories/${item.slug}`}
                className="focus-visible:ring-ring group inline-flex items-center gap-3 rounded-sm text-xl font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                <span>{copy.title}</span>
                <ArrowRight className="size-4 shrink-0" aria-hidden />
              </Link>
              <p className="text-muted-foreground mt-2 max-w-prose text-sm leading-relaxed">
                {copy.overview}
              </p>
              {copy.fallback && (
                <p className="text-muted-foreground mt-2 text-xs" lang="nl">
                  {t("fallback")}
                </p>
              )}
            </div>
            <div className="text-muted-foreground flex gap-3 font-mono text-xs sm:flex-col sm:items-end">
              <span>{t("articleCount", { count: item.articleCount })}</span>
              {item.latestAt && (
                <time dateTime={item.latestAt}>
                  {formatStorylineDate(item.latestAt, locale)}
                </time>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function formatStorylineDate(date: string | Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(date));
}

function TimelineEntry({
  membership: m,
  latest,
}: {
  membership: StorylineMembership;
  latest: boolean;
}) {
  const t = useTranslations("newsStories");
  const locale = useLocale();
  const fallback = locale === "nl" && !m.noteNl;
  return (
    <li
      id={`article-${encodeURIComponent(m.articleId)}`}
      className="border-border relative scroll-mt-24 border-b pb-8 pl-7 last:border-b-0"
    >
      <span
        className="bg-background border-foreground absolute top-1 -left-[5px] size-2.5 rounded-full border"
        aria-hidden
      />
      <div className="text-muted-foreground flex flex-wrap items-center gap-3 font-mono text-xs">
        {m.article.publishedAt ? (
          <time dateTime={new Date(m.article.publishedAt).toISOString()}>
            {formatStorylineDate(m.article.publishedAt, locale)}
          </time>
        ) : (
          <span>{t("undated")}</span>
        )}
        {latest && (
          <span className="text-foreground font-semibold">{t("latest")}</span>
        )}
      </div>
      <h3 className="mt-3 text-xl leading-snug font-semibold">
        {m.article.title}
      </h3>
      {m.article.author && (
        <p className="text-muted-foreground mt-1 text-sm">{m.article.author}</p>
      )}
      <p className="mt-5 text-sm font-semibold">{t("adds")}</p>
      <p
        className="mt-1 max-w-prose leading-relaxed"
        lang={fallback ? "en" : locale}
      >
        {locale === "nl" && m.noteNl ? m.noteNl : m.noteEn}
      </p>
      {fallback && (
        <p className="text-muted-foreground mt-2 text-xs">{t("fallback")}</p>
      )}
      <details className="mt-4 text-sm">
        <summary className="focus-visible:ring-ring cursor-pointer rounded-sm underline-offset-4 hover:underline focus-visible:ring-2">
          {t("evidence")}
        </summary>
        <blockquote className="border-border text-muted-foreground mt-3 border-l pl-4 leading-relaxed">
          {m.evidence}
        </blockquote>
      </details>
      <a
        href={m.article.url}
        rel="noopener noreferrer"
        className="focus-visible:ring-ring mt-4 inline-flex items-center gap-1 rounded-sm text-sm underline underline-offset-4 focus-visible:ring-2"
      >
        {t("source")}
        <ArrowUpRight className="size-4" aria-hidden />
      </a>
    </li>
  );
}

export function StorylineReader({
  story,
  related,
}: {
  story: StorylineDetail;
  related: Awaited<ReturnType<typeof relatedStorylines>>;
}) {
  const t = useTranslations("newsStories");
  const locale = useLocale();
  const copy = storylineCopy(story, locale);
  const timeline = storylineTimeline(story.articles);
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 sm:px-10 sm:py-16">
      <Link
        href="/news/stories"
        className="text-muted-foreground text-sm underline underline-offset-4"
      >
        {t("back")}
      </Link>
      <header className="mt-8 max-w-3xl">
        <h1
          className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl"
          lang={locale === "nl" && !story.titleNl ? "en" : locale}
        >
          {copy.title}
        </h1>
        <p
          className="text-muted-foreground mt-6 text-lg leading-relaxed"
          lang={locale === "nl" && !story.overviewNl ? "en" : locale}
        >
          {copy.overview}
        </p>
        {copy.fallback && (
          <p className="text-muted-foreground mt-3 text-sm">{t("fallback")}</p>
        )}
        <p className="text-muted-foreground mt-5 text-sm">{t("editorial")}</p>
        <div className="mt-6 flex flex-wrap items-center gap-5 text-sm">
          <span>{t("articleCount", { count: story.articles.length })}</span>
          {timeline.latestId && (
            <a
              href={`#article-${encodeURIComponent(timeline.latestId)}`}
              className="underline underline-offset-4"
            >
              {t("latest")}
            </a>
          )}
        </div>
      </header>
      <section className="mt-14 max-w-3xl" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="text-2xl font-semibold">
          {t("timeline")}
        </h2>
        <ol className="border-border mt-8 space-y-8 border-l">
          {timeline.dated.map((m) => (
            <TimelineEntry
              key={m.articleId}
              membership={m}
              latest={m.articleId === timeline.latestId}
            />
          ))}
        </ol>
        {!!timeline.undated.length && (
          <>
            <h3 className="mt-10 text-lg font-semibold">{t("undated")}</h3>
            <ol className="border-border mt-6 space-y-8 border-l">
              {timeline.undated.map((m) => (
                <TimelineEntry
                  key={m.articleId}
                  membership={m}
                  latest={false}
                />
              ))}
            </ol>
          </>
        )}
      </section>
      {!!copy.questions.length && (
        <section className="border-border mt-14 max-w-3xl border-t pt-8">
          <h2 className="text-2xl font-semibold">{t("questions")}</h2>
          <ul
            className="mt-4 list-disc space-y-3 pl-5 leading-relaxed"
            lang={locale === "nl" && !story.questionsNl.length ? "en" : locale}
          >
            {copy.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      )}
      {!!related.length && (
        <section className="border-border mt-14 border-t pt-8">
          <h2 className="text-2xl font-semibold">{t("related")}</h2>
          <div className="mt-6 divide-y">
            {related.map((c) => {
              const target = storylineCopy(c.target, locale);
              return (
                <article
                  key={`${c.sourceId}:${c.targetId}:${c.relation}`}
                  className="py-5"
                >
                  <p className="text-muted-foreground text-sm">
                    {t(
                      `relations.${c.incoming ? `incoming_${c.relation}` : c.relation}`,
                    )}
                  </p>
                  <Link
                    href={`/news/stories/${c.target.slug}`}
                    className="mt-2 inline-block text-lg font-semibold underline underline-offset-4"
                  >
                    {target.title}
                  </Link>
                  <details className="mt-3">
                    <summary className="focus-visible:ring-ring cursor-pointer rounded-sm text-sm focus-visible:ring-2">
                      {t("why")}
                    </summary>
                    <p
                      className="mt-3 max-w-prose leading-relaxed"
                      lang={locale === "nl" && !c.explanationNl ? "en" : locale}
                    >
                      {locale === "nl" && c.explanationNl
                        ? c.explanationNl
                        : c.explanationEn}
                    </p>
                    {locale === "nl" && !c.explanationNl && (
                      <p className="text-muted-foreground mt-2 text-xs">
                        {t("fallback")}
                      </p>
                    )}
                    <p className="text-muted-foreground mt-3 text-xs">
                      {t("reviewed")}
                    </p>
                    <ul className="mt-3 space-y-4">
                      {c.evidence.map((m) => (
                        <li key={`${m.storylineId}:${m.articleId}`}>
                          <a
                            href={m.article.url}
                            rel="noopener noreferrer"
                            className="text-sm underline underline-offset-4"
                          >
                            {m.article.title}
                          </a>
                          <blockquote className="text-muted-foreground mt-1 max-w-prose text-sm">
                            {m.evidence}
                          </blockquote>
                        </li>
                      ))}
                    </ul>
                  </details>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <footer className="border-border mt-14 border-t pt-6">
        <Link href="/news" className="text-sm underline underline-offset-4">
          {t("archive")}
        </Link>
      </footer>
    </main>
  );
}
