import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { Link } from "@/i18n/navigation";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { estimateReadingTime } from "@/lib/lexical";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Blog",
    description:
      "Articles, tutorials, and talk recordings from the AI Tech Community.",
    ...buildOgMeta(
      "Blog",
      "Articles, tutorials, and talk recordings from the AI Tech Community.",
      "Blog",
    ),
    alternates: buildAlternates("/blog"),
  };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const t = await getTranslations("blog");
  const params = await searchParams;

  // Parse and clamp page number
  const rawPage = typeof params.page === "string" ? parseInt(params.page, 10) : 1;
  const requestedPage = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "articles",
    where: {
      and: [
        { status: { equals: "published" } },
        {
          or: [
            { authorType: { not_equals: "member" } },
            { reviewStatus: { equals: "approved" } },
          ],
        },
      ],
    },
    sort: "-publishedAt",
    locale: locale as "en" | "nl",
    draft: false,
    limit: 10,
    page: requestedPage,
  });

  const totalPages = result.totalPages;

  // Redirect to last page if requested page exceeds total (show last page, not empty results)
  if (requestedPage > totalPages && totalPages > 0) {
    redirect(`/blog?page=${totalPages}`);
  }

  const page = Math.min(requestedPage, Math.max(1, totalPages));
  const articles = result.docs;

  // Type label map using i18n keys for proper localization
  const typeLabels: Record<string, string> = {
    article: t("article"),
    tutorial: t("tutorial"),
    talk_recording: t("talkRecording"),
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      {/* Section Header */}
      <div className="border-border flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / {t("title").toUpperCase()}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/feed.xml"
            className="border-border text-muted-foreground hover:text-foreground rounded border px-3 py-1 font-mono text-xs tracking-wider transition-colors"
            title="RSS Feed"
          >
            {t("rssFeed")}
          </a>
          <Link
            href="/blog/write"
            className="border-border text-muted-foreground hover:text-foreground rounded border px-3 py-1 font-mono text-xs tracking-wider transition-colors"
          >
            + WRITE
          </Link>
        </div>
      </div>

      {articles.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center">{t("noArticles")}</p>
      ) : (
        <>
          {/* Table Header - desktop only */}
          <div className="border-border hidden items-center border-b px-4 py-2.5 sm:flex">
            <span className="text-muted-foreground w-32 font-mono text-[11px] font-medium tracking-wider">
              / DATE
            </span>
            <span className="text-muted-foreground flex-1 font-mono text-[11px] font-medium tracking-wider">
              / TITLE
            </span>
            <span className="text-muted-foreground w-20 font-mono text-[11px] font-medium tracking-wider">
              / READ
            </span>
            <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-wider">
              / TYPE
            </span>
          </div>

          {/* Article Rows */}
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/blog/${article.slug}`}
              className="border-border hover:bg-secondary/50 flex flex-col gap-2 border-b px-4 py-4 transition-colors sm:flex-row sm:items-center sm:gap-0 sm:py-3.5"
            >
              {/* Title - first on mobile for readability */}
              <span className="text-[15px] font-medium leading-snug sm:order-2 sm:flex-1">
                {article.title}
                {article.authorType === "member" && article.authorName && (
                  <span className="text-muted-foreground ml-2 font-mono text-[10px] font-normal tracking-wider">
                    by {article.authorName}
                  </span>
                )}
              </span>

              {/* Date + type row on mobile, split on desktop */}
              <div className="flex items-center gap-3 sm:order-1 sm:w-32">
                <div className="bg-foreground h-2 w-2 rounded-full" />
                <span className="font-mono text-[12px] sm:text-[13px]">
                  {article.publishedAt ? formatDate(article.publishedAt) : "-"}
                </span>
                {/* Type badge - inline on mobile */}
                <span className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider sm:hidden">
                  {typeLabels[article.type] ?? article.type}
                </span>
                {/* Reading time - inline on mobile */}
                <span className="text-muted-foreground font-mono text-[10px] tracking-wider sm:hidden">
                  {t("readingTime", { minutes: estimateReadingTime(article.content) })}
                </span>
              </div>

              {/* Reading time - desktop */}
              <span className="text-muted-foreground hidden w-20 font-mono text-[11px] tracking-wider sm:order-3 sm:inline">
                {t("readingTime", { minutes: estimateReadingTime(article.content) })}
              </span>

              {/* Type badge - desktop only */}
              <span className="border-border text-muted-foreground hidden rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider sm:order-4 sm:inline">
                {typeLabels[article.type] ?? article.type}
              </span>
              <span className="text-muted-foreground ml-4 hidden font-mono text-lg font-light sm:order-5 sm:inline">+</span>
            </Link>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-6 font-mono text-xs tracking-wider">
              {page > 1 ? (
                <Link
                  href={`/blog?page=${page - 1}`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← {t("pagination.prev")}
                </Link>
              ) : (
                <span className="text-muted-foreground/40">← {t("pagination.prev")}</span>
              )}

              <span className="text-muted-foreground">
                {page} / {totalPages}
              </span>

              {page < totalPages ? (
                <Link
                  href={`/blog?page=${page + 1}`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("pagination.next")} →
                </Link>
              ) : (
                <span className="text-muted-foreground/40">{t("pagination.next")} →</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
