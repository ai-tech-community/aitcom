import { StorylineLoadError } from "@/components/news/storyline-states";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getSession } from "@/server/better-auth/server";
import { findStoryline, relatedStorylines } from "@/server/news/storylines";
import { storylineCopy } from "@/lib/news/storylines";
import { StorylineReader } from "@/components/news/storyline-reader";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const locale = await getLocale();
  const { slug } = await params;
  const story = await findStoryline({ slug }).catch(() => null);
  const copy = story ? storylineCopy(story, locale) : null;
  return {
    title: copy?.title,
    description: copy?.overview,
    robots: { index: false, follow: true },
  };
}
export default async function StoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations("newsStories");
  let loaded;
  try {
    const session = await getSession();
    const story = await findStoryline({ slug }, false, session?.user?.id);
    loaded = story
      ? { story, related: await relatedStorylines(story.id) }
      : null;
  } catch (err) {
    console.error("news: could not load storyline", err);
    return (
      <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
        <StorylineLoadError />
        <Link href="/news/stories" className="mt-4 inline-block underline">
          {t("back")}
        </Link>
      </main>
    );
  }
  if (!loaded) notFound();
  return <StorylineReader {...loaded} />;
}
