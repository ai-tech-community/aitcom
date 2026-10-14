import {
  StorylineEmpty,
  StorylineLoadError,
} from "@/components/news/storyline-states";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewsSection } from "@/components/news/news-section";
import { WeeklyContributorBoard } from "@/components/news/weekly-contributor-board";
import { WeeklyTopicClaims } from "@/components/news/weekly-topic-claims";
import { Link } from "@/i18n/navigation";
import { StorylineList } from "@/components/news/storyline-reader";
import type { WeeklyTopic } from "@/lib/news/weekly-topics";
import { getSession } from "@/server/better-auth/server";
import { listWeeklyContributorBoard } from "@/server/news/contributions";
import { listStorylines } from "@/server/news/storylines";
import { listWeeklyStoryTopics } from "@/server/news/weekly-topics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("newsStories");
  return {
    title: t("title"),
    description: t("intro"),
    robots: { index: false, follow: true },
  };
}
export default async function StoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const t = await getTranslations("newsStories");
  const tabs = await getTranslations("newsPage");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const page =
    typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  let result;
  const board = await listWeeklyContributorBoard().catch((err: unknown) => {
    console.error("news: contributor board unavailable", err);
    return [];
  });
  let topics: WeeklyTopic[] = [];
  try {
    topics = await listWeeklyStoryTopics();
  } catch (err) {
    console.error("news: weekly topics unavailable", err);
  }
  try {
    const session = await getSession();
    const viewerId = session?.user?.id;
    result = await listStorylines({
      q,
      page,
      ...(viewerId ? { viewerId } : {}),
    });
  } catch (err) {
    console.error("news: could not load story index", err);
  }
  const href = (p: number) =>
    `/news/stories?${new URLSearchParams({ q, page: String(p) })}`;
  return (
    <NewsSection
      label={tabs("tabsLabel")}
      news={tabs("tabNews")}
      stories={tabs("tabStories")}
    >
      <h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground mt-3 text-lg">{t("intro")}</p>
      <Link
        href="/news/stories/contribute"
        className="mt-4 inline-block text-sm underline underline-offset-4"
      >
        {t("contribute.entry")}
      </Link>
      <WeeklyContributorBoard
        rows={board}
        title={tabs("leaderboardTitle")}
        emptyLabel={tabs("leaderboardEmpty")}
        emptyHref="/news/stories/contribute"
        pointsLabel={(points) => tabs("leaderboardPoints", { points })}
        agentLabel={(name) => tabs("leaderboardAgent", { name })}
      />
      <WeeklyTopicClaims topics={topics} />
      <form method="get" className="mt-8 mb-8 flex flex-wrap items-end gap-3">
        <label className="flex-1 text-sm">
          <span>{t("search")}</span>
          <Input
            name="q"
            defaultValue={q}
            placeholder={t("searchHint")}
            maxLength={200}
            className="mt-2"
          />
        </label>
        <Button type="submit" variant="outline">
          {t("apply")}
        </Button>
      </form>
      {!result ? (
        <StorylineLoadError />
      ) : result.items.length ? (
        <StorylineList items={result.items} />
      ) : (
        <StorylineEmpty searching={!!q} />
      )}
      {result && result.totalPages > 1 && (
        <nav
          className="mt-6 flex items-center justify-between gap-4"
          aria-label={t("title")}
        >
          {result.page > 1 ? (
            <Link
              href={href(result.page - 1)}
              className="underline underline-offset-4"
            >
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground text-sm">
            {t("page", { page: result.page, total: result.totalPages })}
          </span>
          {result.page < result.totalPages ? (
            <Link
              href={href(result.page + 1)}
              className="underline underline-offset-4"
            >
              {t("next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </NewsSection>
  );
}
