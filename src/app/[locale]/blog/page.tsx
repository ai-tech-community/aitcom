import { getLocale, getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { Link } from "@/i18n/navigation";

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
    where: { status: { equals: "published" } },
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
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("title").toUpperCase()}
        </span>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>

      {articles.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center">{t("noArticles")}</p>
      ) : (
        <>
          {/* Table Header */}
          <div className="border-border flex items-center border-b px-4 py-2.5">
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
              className="border-border hover:bg-secondary/50 flex items-center border-b px-4 py-3.5 transition-colors"
            >
              <div className="flex w-32 items-center gap-3">
                <div className="bg-foreground h-2 w-2 rounded-full" />
                <span className="font-mono text-[13px]">
                  {article.publishedAt ? formatDate(article.publishedAt) : "—"}
                </span>
              </div>
              <span className="flex-1 font-medium">{article.title}</span>
              <span className="border-border text-muted-foreground rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider">
                {typeLabels[article.type] ?? article.type}
              </span>
              <span className="text-muted-foreground ml-4 font-mono text-lg font-light">+</span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
