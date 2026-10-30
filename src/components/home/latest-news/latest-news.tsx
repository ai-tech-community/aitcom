import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { MoreLink } from "@/components/ui/more-link";
import { SectionLabel } from "@/components/ui/section-label";
import type { HomeNewsItem } from "@/server/news/home";

export function LatestNews({
  items,
  embedded = false,
}: {
  items: readonly HomeNewsItem[];
  embedded?: boolean;
}) {
  const t = useTranslations("homeNews");
  const locale = useLocale();
  if (!items.length) return null;
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return (
    <section
      aria-labelledby="home-news-title"
      className={embedded ? "min-w-0" : "px-6 py-12 sm:px-12"}
    >
      <SectionLabel id="home-news-title" className="pb-4">
        {t("title")}
      </SectionLabel>
      <ol className="divide-border border-border divide-y border-b">
        {items.map((item) => (
          <li key={`${item.kind}-${item.id}`} className="py-5">
            <article
              className={
                embedded
                  ? "grid gap-2"
                  : "grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6"
              }
            >
              <div
                className={`text-muted-foreground flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs ${embedded ? "" : "sm:flex-col sm:gap-2"}`}
              >
                <span className="text-foreground font-medium">
                  {t(item.kind)}
                </span>
                <time dateTime={item.date} className="font-mono">
                  {date.format(new Date(item.date))}
                </time>
              </div>
              <div className="min-w-0">
                <h3
                  className={`text-base leading-snug font-semibold ${embedded ? "" : "sm:text-lg"}`}
                  lang={item.englishFallback ? "en" : undefined}
                >
                  {item.kind === "story" ? (
                    <Link
                      href={item.href}
                      className="focus-visible:ring-ring rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {item.title}
                    </Link>
                  ) : (
                    <a
                      href={item.href}
                      rel="noopener noreferrer"
                      className="focus-visible:ring-ring rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {item.title}
                    </a>
                  )}
                </h3>
                {!embedded && (
                  <p
                    className="text-muted-foreground mt-1 line-clamp-2 max-w-prose text-sm leading-relaxed"
                    lang={item.englishFallback ? "en" : undefined}
                  >
                    {item.summary}
                  </p>
                )}
                {item.source ? (
                  <p className="text-muted-foreground mt-2 text-xs">
                    {item.source}
                  </p>
                ) : null}
                {item.englishFallback ? (
                  <p className="text-muted-foreground mt-2 text-xs">
                    {t("englishFallback")}
                  </p>
                ) : null}
              </div>
            </article>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap justify-end gap-x-6 gap-y-2">
        <MoreLink href="/news">{t("allNews")}</MoreLink>
        <MoreLink href="/news/stories">{t("allStories")}</MoreLink>
      </div>
    </section>
  );
}
