import {
  StorylineEmpty,
  StorylineLoadError,
} from "@/components/news/storyline-states";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StoryContributeDialog } from "@/components/news/story-contribute-dialog";
import { NewsSection } from "@/components/news/news-section";
import { Link } from "@/i18n/navigation";
import { StorylineList } from "@/components/news/storyline-reader";
import { getSession } from "@/server/better-auth/server";
import { listStorylines } from "@/server/news/storylines";
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
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-3 text-lg">{t("intro")}</p>
        </div>
        <div className="self-start sm:self-auto">
          <StoryContributeDialog />
        </div>
      </header>
      <form method="get" className="mt-8 mb-6 flex items-end gap-3">
        <label className="min-w-0 flex-1 text-sm">
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
