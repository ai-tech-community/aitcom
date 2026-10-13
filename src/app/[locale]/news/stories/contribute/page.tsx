import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { StorylineContributions } from "@/components/news/storyline-contributions";
import { StorylinePreview } from "@/components/news/storyline-preview";

export default async function ContributeStoriesPage() {
  const t = await getTranslations("newsStories.contribute");
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
      <StorylineContributions />
      <StorylinePreview staff={false} showContribute={false} />
    </main>
  );
}
