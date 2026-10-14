import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localeAlternates } from "@/lib/metadata";
import { ContributeDesk } from "@/components/news/contribute-desk";
import { StorylinePreview } from "@/components/news/storyline-preview";
import { listWeeklyStoryTopics } from "@/server/news/weekly-topics";
import type { WeeklyTopic } from "@/lib/news/weekly-topics";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("newsStories.contribute");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: true },
    alternates: await localeAlternates("/news/stories/contribute"),
  };
}

export default async function ContributeStoriesPage() {
  const t = await getTranslations("newsStories.contribute");
  let topics: WeeklyTopic[] = [];
  try {
    topics = await listWeeklyStoryTopics();
  } catch (err) {
    console.error("news: weekly topics unavailable", err);
  }
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 sm:px-12 sm:py-16">
      <Link
        href="/news"
        className="text-muted-foreground text-sm underline underline-offset-4"
      >
        {t("back")}
      </Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <p className="text-muted-foreground mt-3 max-w-prose text-lg">
        {t("intro")}
      </p>
      <section className="mt-8 max-w-prose" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-xl font-semibold">
          {t("howTitle")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed">{t("howSteps")}</p>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {t("howExample")}
        </p>
      </section>
      <section
        className="mt-8 max-w-prose"
        aria-labelledby="contributor-rewards"
      >
        <h2 id="contributor-rewards" className="text-xl font-semibold">
          {t("rewardsTitle")}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {t("rewardsBody")}
        </p>
      </section>
      <ContributeDesk topics={topics} />
      <StorylinePreview staff={false} showContribute={false} />
    </main>
  );
}
