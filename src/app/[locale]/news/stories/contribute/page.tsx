import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localeAlternates } from "@/lib/metadata";
import { newsGameRobots } from "@/lib/news/indexability";
import { ContributeDesk } from "@/components/news/contribute-desk";
import { listWeeklyStoryTopics } from "@/server/news/weekly-topics";
import { WeeklyContributorBoard } from "@/components/news/weekly-contributor-board";
import { listWeeklyContributorBoard } from "@/server/news/contributions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("newsStories.contribute");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: newsGameRobots(),
    alternates: await localeAlternates("/news/stories/contribute"),
  };
}

export default async function ContributeStoriesPage() {
  const t = await getTranslations("newsStories.contribute");
  const news = await getTranslations("newsPage");
  const [topics, board] = await Promise.all([
    listWeeklyStoryTopics().catch((err: unknown) => {
      console.error("news: weekly topics unavailable", err);
      return [];
    }),
    listWeeklyContributorBoard().catch((err: unknown) => {
      console.error("news: contributor board unavailable", err);
      return [];
    }),
  ]);
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 sm:px-12 sm:py-16">
      <Link
        href="/news/stories"
        className="text-muted-foreground text-sm underline underline-offset-4"
      >
        {t("backStories")}
      </Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <p className="text-muted-foreground mt-3 max-w-prose text-lg">
        {t("intro")}
      </p>
      <ContributeDesk topics={topics} />
      <details className="border-border mt-8 border-t pt-6">
        <summary className="focus-visible:ring-ring w-fit cursor-pointer rounded-sm font-medium focus-visible:ring-2 focus-visible:outline-none">
          {t("howTitle")}
        </summary>
        <div className="mt-4 max-w-prose space-y-4 text-sm leading-relaxed">
          <p>{t("howSteps")}</p>
          <p className="text-muted-foreground">{t("howExample")}</p>
          <div>
            <h2 className="font-semibold">{t("rewardsTitle")}</h2>
            <p className="text-muted-foreground mt-1">{t("rewardsBody")}</p>
          </div>
        </div>
      </details>
      <details className="border-border mt-6 border-t pt-6">
        <summary className="focus-visible:ring-ring w-fit cursor-pointer rounded-sm font-medium focus-visible:ring-2 focus-visible:outline-none">
          {t("contributorsTitle")}
        </summary>
        <WeeklyContributorBoard
          rows={board}
          title={news("leaderboardTitle")}
          emptyLabel={news("leaderboardEmpty")}
          emptyHref="/news/stories/contribute"
          pointsLabel={(points) => news("leaderboardPoints", { points })}
          agentLabel={(name) => news("leaderboardAgent", { name })}
        />
      </details>
    </main>
  );
}
