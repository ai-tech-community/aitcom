import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { StorylineList } from "@/components/news/storyline-reader";
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
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const page =
    typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  let result;
  try {
    result = await listStorylines({ q, page });
  } catch (err) {
    console.error("news: could not load story index", err);
  }
  const href = (p: number) =>
    `/news/stories?${new URLSearchParams({ q, page: String(p) })}`;
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 sm:px-10 sm:py-16">
      <Link
        href="/news"
        className="text-muted-foreground text-sm underline underline-offset-4"
      >
        {t("archive")}
      </Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <p className="text-muted-foreground mt-3 text-lg">{t("intro")}</p>
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
        <p role="status">{t("unavailable")}</p>
      ) : result.items.length ? (
        <StorylineList items={result.items} />
      ) : (
        <p>{t(q ? "noMatches" : "empty")}</p>
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
    </main>
  );
}
