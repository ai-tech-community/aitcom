"use client";

import { useLocale, useTranslations } from "next-intl";

import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";

function formatDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/**
 * Feed-sourced stories for the community's news sector. A sector with no
 * real feed shows that, and never a made-up headline.
 */
export function CommunitySectorNews({ slug }: { slug: string }) {
  const t = useTranslations("communities.profile");
  const sectors = useTranslations("newsSectors");
  const locale = useLocale();
  const { data, isLoading } = api.news.communityStories.useQuery({ slug });

  if (isLoading) {
    return (
      <div className="space-y-2" data-sidebar-section="news">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 rounded-lg" />
      </div>
    );
  }
  if (!data) return null;

  const sectorName = sectors(data.sector);
  return (
    <section data-sidebar-section="news">
      <div className="border-border flex flex-wrap items-center justify-between gap-x-3 border-b pb-2">
        <SectionLabel bordered={false}>{t("news")}</SectionLabel>
        {data.hasRealFeeds ? (
          <Link
            href={`/news?sector=${data.sector}`}
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
          >
            {t("newsAll", { sector: sectorName })}
          </Link>
        ) : null}
      </div>
      {data.hasRealFeeds && data.stories.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {data.stories.map((story) => (
            <li key={story.id}>
              <a
                href={story.url}
                rel="noopener noreferrer"
                className="border-border hover:bg-secondary/50 block rounded-lg border px-3 py-2.5"
              >
                <span className="line-clamp-2 text-sm font-medium">
                  {story.title}
                </span>
                {story.publishedAt ? (
                  <time
                    dateTime={story.publishedAt}
                    className="text-muted-foreground mt-1 block font-mono text-xs"
                  >
                    {formatDay(story.publishedAt, locale)}
                  </time>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-3 text-sm">
          {data.hasRealFeeds
            ? t("newsNoStories", { sector: sectorName })
            : t("newsEmpty", { sector: sectorName })}
        </p>
      )}
    </section>
  );
}
