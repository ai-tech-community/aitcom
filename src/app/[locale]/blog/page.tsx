import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { Link } from "@/i18n/navigation";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";

export const metadata: Metadata = {
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

export default async function BlogPage() {
  const locale = await getLocale();
  const t = await getTranslations("blog");

  const payload = await getPayloadClient();
  const { docs: articles } = await payload.find({
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
  });

  // Type label map using i18n keys for proper localization
  const typeLabels: Record<string, string> = {
    article: t("article"),
    tutorial: t("tutorial"),
    talk_recording: t("talkRecording"),
  };

  return (
    <div className="px-6 py-16 sm:px-12">
      {/* Section Header */}
      <div className="border-border flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / {t("title").toUpperCase()}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
        </div>
        <Link
          href="/blog/write"
          className="border-border text-muted-foreground hover:text-foreground rounded border px-3 py-1 font-mono text-xs tracking-wider transition-colors"
        >
          + WRITE
        </Link>
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
              </div>

              {/* Type badge - desktop only */}
              <span className="border-border text-muted-foreground hidden rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider sm:order-3 sm:inline">
                {typeLabels[article.type] ?? article.type}
              </span>
              <span className="text-muted-foreground ml-4 hidden font-mono text-lg font-light sm:order-4 sm:inline">+</span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
